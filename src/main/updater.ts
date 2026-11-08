import { app, shell } from 'electron'
import { spawn, execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
// Node's own fs: Electron's treats .asar files as folders, so it can't delete an app copy.
import rawFs from 'original-fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { LATEST_RELEASE_API, newerRelease, RELEASES_PAGE, type GitHubRelease, type InstallKind, type ReleaseInfo } from '@shared/release'
import type { UpdateStatus } from '@shared/types'
import { version } from '../../package.json'
import { getSettings } from './settings'

// In-app updates from the GitHub repo's Releases. Every build is ad-hoc signed, which the usual
// Electron updaters refuse, so StreamHub installs its own way on each platform:
//   macOS     the release's -mac.zip, unpacked, swapped in for the running .app, then reopened
//   Windows   the release's Setup .exe, run silently into the same folder; it reopens StreamHub
//   AppImage  the new AppImage swapped in for the running file, then started
//   Steam     (scripts/steam/install.sh's ~/.local/share/StreamHub/app) the AppImage unpacked
//             and swapped in for app/, then started again through the launcher
// The running copy's files are moved aside rather than overwritten (allowed while they run), and
// what's left of it is cleaned up on the next launch.

const run = promisify(execFile)
const CHECK_EVERY_MS = 6 * 60 * 60_000
const FIRST_CHECK_MS = 10_000

// From package.json at build time (app.getVersion() is Electron's own version when run unpackaged).
let status: UpdateStatus = { current: version, state: 'idle', inApp: false }
let release: ReleaseInfo | null = null
let downloaded: string | null = null
let notify: () => void = () => {}

const STEAM_DIR = path.join(os.homedir(), '.local/share/StreamHub')
/** This copy was installed by the Steam installer (scripts/steam/install.sh) and runs from its folder. */
export const isSteamCopy = (): boolean => process.platform === 'linux' && process.execPath.startsWith(path.join(STEAM_DIR, 'app') + path.sep)
/** Under Steam's Game Mode a restarted app wouldn't be Steam's game anymore, so it just closes. */
const inGameMode = (): boolean => process.env.SteamGamepadUI === '1' || process.env.XDG_CURRENT_DESKTOP === 'gamescope'

/** The running app's .app bundle (macOS). */
const macBundle = (): string => path.resolve(process.execPath, '../../..')

function installKind(): InstallKind {
  if (!app.isPackaged) return 'none'
  if (process.platform === 'darwin') return macBundle().endsWith('.app') ? 'mac-app' : 'none'
  if (process.platform === 'win32') return 'win-nsis'
  if (process.platform === 'linux') {
    if (process.env.APPIMAGE) return 'appimage'
    if (isSteamCopy()) return 'steam'
  }
  return 'none'
}

const kind = installKind()
const updateDir = (): string => path.join(app.getPath('userData'), 'update')

export const updateStatus = (): UpdateStatus => status

function set(patch: Partial<UpdateStatus>): void {
  status = { ...status, ...patch }
  notify()
}

/** Checks now. `quiet` (the automatic checks) leaves the status alone when the check fails. */
export async function checkForUpdates(quiet = false): Promise<void> {
  if (['checking', 'downloading', 'ready', 'installing'].includes(status.state)) return
  set({ state: 'checking', error: undefined })
  try {
    const res = await fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': `StreamHub/${status.current}` } })
    // No release published yet reads as "up to date".
    if (res.status === 404) return set({ state: 'latest', lastCheck: Date.now() })
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    release = newerRelease((await res.json()) as GitHubRelease, status.current, kind)
    if (!release) return set({ state: 'latest', version: undefined, lastCheck: Date.now() })
    set({
      state: 'available',
      version: release.version,
      notes: release.notes,
      page: release.page,
      inApp: Boolean(release.asset),
      closesToInstall: kind === 'steam' && inGameMode(),
      lastCheck: Date.now()
    })
  } catch (e) {
    if (quiet) set({ state: release ? 'available' : 'idle' })
    else set({ state: 'error', error: `Couldn't check for updates: ${(e as Error).message}` })
  }
}

/** Downloads the new version's file (checking it against the release's checksum). */
export async function downloadUpdate(): Promise<void> {
  if (!release?.asset || status.state === 'downloading') {
    if (release && !release.asset) void shell.openExternal(release.page)
    return
  }
  const asset = release.asset
  set({ state: 'downloading', progress: 0, error: undefined })
  try {
    rawFs.rmSync(updateDir(), { recursive: true, force: true })
    fs.mkdirSync(updateDir(), { recursive: true })
    const file = path.join(updateDir(), asset.name)
    const res = await fetch(asset.url, { headers: { 'User-Agent': `StreamHub/${status.current}` } })
    if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`)
    const total = Number(res.headers.get('content-length')) || asset.size
    const hash = createHash('sha256')
    const out = fs.createWriteStream(file)
    let got = 0
    let shown = 0
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
      got += value.length
      if (!out.write(value)) await new Promise((r) => out.once('drain', r))
      if (total && got / total - shown >= 0.01) {
        shown = got / total
        set({ progress: shown })
      }
    }
    await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())))
    if (asset.sha256 && hash.digest('hex') !== asset.sha256) throw new Error('the download was damaged; try again')
    downloaded = file
    set({ state: 'ready', progress: 1 })
  } catch (e) {
    set({ state: 'error', error: `Couldn't download the update: ${(e as Error).message}` })
  }
}

/** Starts `cmd` on its own (it outlives StreamHub) once this process has quit. */
function afterQuit(script: string): void {
  spawn('/bin/sh', ['-c', `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done; ${script}`], { detached: true, stdio: 'ignore' }).unref()
}

/** An environment for the new copy without the running AppImage's own paths. */
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const k of ['APPIMAGE', 'APPDIR', 'OWD', 'ARGV0', 'CHROME_DESKTOP']) delete env[k]
  return env
}

const quote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

/** Installs the downloaded update and restarts into it (or closes, in Steam's Game Mode). */
export async function installUpdate(): Promise<void> {
  if (status.state !== 'ready' || !downloaded) return
  set({ state: 'installing' })
  try {
    if (kind === 'mac-app') {
      const target = macBundle()
      fs.accessSync(path.dirname(target), fs.constants.W_OK)
      const unpacked = path.join(updateDir(), 'unpacked')
      await run('/usr/bin/ditto', ['-x', '-k', downloaded, unpacked])
      const bundle = fs.readdirSync(unpacked).find((n) => n.endsWith('.app'))
      if (!bundle) throw new Error('the update has no app in it')
      const next = path.join(unpacked, bundle)
      await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', next]).catch(() => {})
      const old = `${target}.old`
      rawFs.rmSync(old, { recursive: true, force: true })
      fs.renameSync(target, old)
      try {
        fs.renameSync(next, target)
      } catch {
        // Another volume: copy it over instead.
        await run('/usr/bin/ditto', [next, target]).catch((e) => {
          fs.renameSync(old, target)
          throw e
        })
      }
      afterQuit(`/usr/bin/open -n ${quote(target)}`)
    } else if (kind === 'win-nsis') {
      // electron-builder's installer: /S installs silently into the same folder (for this user, so no
      // admin prompt) and --force-run opens StreamHub when it's done.
      spawn(downloaded, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref()
    } else if (kind === 'appimage') {
      const target = process.env.APPIMAGE!
      const next = `${target}.new`
      fs.copyFileSync(downloaded, next)
      fs.chmodSync(next, 0o755)
      fs.renameSync(next, target)
      spawn('/bin/sh', ['-c', `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done; exec ${quote(target)}`], {
        detached: true,
        stdio: 'ignore',
        env: cleanEnv()
      }).unref()
    } else if (kind === 'steam') {
      fs.chmodSync(downloaded, 0o755)
      await run(downloaded, ['--appimage-extract'], { cwd: updateDir(), env: cleanEnv(), maxBuffer: 64 * 1024 * 1024 })
      const next = path.join(updateDir(), 'squashfs-root')
      const appDir = path.join(STEAM_DIR, 'app')
      rawFs.rmSync(`${appDir}.old`, { recursive: true, force: true })
      fs.renameSync(appDir, `${appDir}.old`)
      fs.renameSync(next, appDir)
      fs.writeFileSync(path.join(STEAM_DIR, 'version'), `${release?.version ?? ''}\n`)
      if (!inGameMode()) afterQuit(`exec ${quote(path.join(STEAM_DIR, 'streamhub'))} >/dev/null 2>&1`)
    } else {
      throw new Error("this copy of StreamHub can't update itself")
    }
    app.quit()
  } catch (e) {
    const message = (e as NodeJS.ErrnoException).code === 'EACCES' ? "StreamHub's folder can't be changed by your account" : (e as Error).message
    set({ state: 'error', error: `Couldn't install the update: ${message}. Download it from the release page instead.`, page: release?.page ?? RELEASES_PAGE })
  }
}

/** Removes what the last update left behind: the old copy moved aside and the downloaded file. */
function cleanUp(): void {
  const leftovers = [updateDir()]
  if (kind === 'mac-app') leftovers.push(`${macBundle()}.old`)
  if (kind === 'steam') leftovers.push(path.join(STEAM_DIR, 'app.old'))
  for (const p of leftovers) rawFs.rm(p, { recursive: true, force: true }, () => {})
}

/** Starts the automatic checks (when the setting is on). */
export function startUpdater(onChange: () => void): void {
  notify = onChange
  status = { ...status, inApp: kind !== 'none' }
  cleanUp()
  const auto = (): void => {
    if (getSettings().checkUpdates) void checkForUpdates(true)
  }
  setTimeout(auto, FIRST_CHECK_MS)
  setInterval(auto, CHECK_EVERY_MS)
}
