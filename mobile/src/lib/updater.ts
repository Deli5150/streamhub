import { Platform as OS, Share } from 'react-native'
import Constants from 'expo-constants'
import * as Linking from 'expo-linking'
import { cacheDirectory, createDownloadResumable, deleteAsync, makeDirectoryAsync } from 'expo-file-system/legacy'
import { LATEST_RELEASE_API, newerRelease, RELEASES_PAGE, type GitHubRelease, type ReleaseInfo } from '@shared/release'
import type { UpdateStatus } from '@shared/types'
import StreamhubUpdater from '../../modules/streamhub-updater/src/StreamhubUpdaterModule'
import { getSettings } from './settings'

// The phones' side of the in-app updater (the desktop's is src/main/updater.ts), from the same GitHub
// Releases. Android downloads the new APK and opens the system installer on it (same signing key, so
// it installs over the app and keeps everything). An iPhone can't install apps itself: it downloads
// the new .ipa and offers to save it (to Files → Downloads, say), ready to sideload as before.

const CHECK_EVERY_MS = 6 * 60 * 60_000
const UPDATES_DIR = `${cacheDirectory}updates/`

/** Which release file this phone downloads: the APK (Android, installed here), or the .ipa (iPhone, saved). */
const KIND = OS.OS === 'ios' ? 'ios' : OS.OS === 'android' && StreamhubUpdater ? 'android' : 'none'

let status: UpdateStatus = { current: Constants.expoConfig?.version ?? '0.0.0', state: 'idle', inApp: KIND !== 'none' }
let release: ReleaseInfo | null = null
let downloaded: string | null = null
let notify: () => void = () => {}
let lastAuto = 0

export const updateStatus = (): UpdateStatus => status

function set(patch: Partial<UpdateStatus>): void {
  status = { ...status, ...patch }
  notify()
}

export async function checkForUpdates(quiet = false): Promise<void> {
  if (['checking', 'downloading', 'ready', 'installing'].includes(status.state)) return
  set({ state: 'checking', error: undefined })
  try {
    const res = await fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (res.status === 404) return set({ state: 'latest', lastCheck: Date.now() })
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    release = newerRelease((await res.json()) as GitHubRelease, status.current, KIND)
    if (!release) return set({ state: 'latest', version: undefined, lastCheck: Date.now() })
    set({ state: 'available', version: release.version, notes: release.notes, page: release.page, inApp: Boolean(release.asset), lastCheck: Date.now() })
  } catch (e) {
    if (quiet) set({ state: release ? 'available' : 'idle' })
    else set({ state: 'error', error: `Couldn't check for updates: ${(e as Error).message}` })
  }
}

/** Downloads the APK (Android) or .ipa (iPhone); without one in the release, opens the release page. */
export async function downloadUpdate(): Promise<void> {
  if (!release?.asset || KIND === 'none') return void Linking.openURL(release?.page ?? RELEASES_PAGE)
  if (status.state === 'downloading') return
  set({ state: 'downloading', progress: 0, error: undefined })
  try {
    await deleteAsync(UPDATES_DIR, { idempotent: true })
    await makeDirectoryAsync(UPDATES_DIR, { intermediates: true })
    const target = `${UPDATES_DIR}${release.asset.name}`
    let shown = 0
    const task = createDownloadResumable(release.asset.url, target, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      const p = totalBytesWritten / (totalBytesExpectedToWrite || release?.asset?.size || 1)
      if (p - shown >= 0.01) {
        shown = p
        set({ progress: p })
      }
    })
    const result = await task.downloadAsync()
    if (!result || result.status !== 200) throw new Error(`download failed (${result?.status ?? 'cancelled'})`)
    downloaded = result.uri
    set({ state: 'ready', progress: 1 })
  } catch (e) {
    set({ state: 'error', error: `Couldn't download the update: ${(e as Error).message}` })
  }
}

/**
 * Opens Android's installer on the downloaded APK. The first time, Android needs "Install unknown
 * apps" allowed for StreamHub: this opens that switch instead, and the next tap installs. On an
 * iPhone it offers to save the downloaded .ipa instead.
 */
export function installUpdate(): void {
  if (!downloaded) return
  if (OS.OS === 'ios') return void saveIpa(downloaded)
  if (!StreamhubUpdater) return
  if (!StreamhubUpdater.canInstall()) {
    StreamhubUpdater.openInstallSettings()
    set({ error: 'Allow “Install unknown apps” for StreamHub, then come back and tap Install again.' })
    return
  }
  if (!StreamhubUpdater.install(downloaded)) set({ state: 'error', error: 'The downloaded update is gone. Download it again.' })
  else set({ error: undefined })
}

/** iPhone: the share sheet on the downloaded .ipa, to save it (Save to Files) or send it to a computer. */
async function saveIpa(uri: string): Promise<void> {
  try {
    await Share.share({ url: uri })
  } catch (e) {
    set({ error: `Couldn't open the share sheet: ${(e as Error).message}` })
  }
}

/** Checks when the app starts and comes back to the foreground, at most every few hours. */
export function autoCheck(): void {
  if (!getSettings().checkUpdates || Date.now() - lastAuto < CHECK_EVERY_MS) return
  lastAuto = Date.now()
  void checkForUpdates(true)
}

export function startUpdater(onChange: () => void): void {
  notify = onChange
  autoCheck()
}
