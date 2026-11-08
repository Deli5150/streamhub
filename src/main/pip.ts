import path from 'node:path'
import { BrowserWindow, ipcMain, screen, session, webContents, type IpcMainEvent, type WebContents } from 'electron'
import { PLATFORMS, type Platform } from '@shared/types'
import { showMainWindow } from './hub'
import { partitionFor, TWITCH_PLAYER_PARTITION } from '@shared/urls'
import { sessionFor } from './net'
import { getSettings } from './settings'

// Picture in picture: a small frameless window that floats above other apps, playing the stream's
// own player page (or the app's `?view=pip` page for direct HLS videos). The page is styled down to
// just its video, and preload/pip.ts draws StreamHub's controls over it (iOS-style: close and stash,
// speed, sound, back to the app, ±15s, play/pause and a scrubber). Chromium's built-in PiP window
// isn't used: its look and controls can't be changed.

const PIP_PRELOAD = path.join(__dirname, '../preload/pip.js')
const START_TIMEOUT_MS = 30_000
const WIDTH = 480
const MARGIN = 24
/** How much of a stashed window stays on screen. */
const STASH_VISIBLE = 36

/** Shows only the page's video, filling the window (the controls overlay sits above it). */
const VIDEO_ONLY_CSS = `
  html, body { background: #000 !important; overflow: hidden !important; }
  body * { visibility: hidden !important; }
  video[data-sh-pip] { visibility: visible !important; position: fixed !important; inset: 0 !important; width: 100vw !important;
    height: 100vh !important; max-width: none !important; max-height: none !important; object-fit: contain !important;
    transform: none !important; z-index: 2147483646 !important; background: #000 !important; }
`

/**
 * Page-side `keepPlaying()`, in the page's own world. A floating player gets no clicks or keys on the
 * page itself, so players treat it as an idle or background tab (YouTube pauses with "Continue
 * watching?" after a while; others throttle or stall and stay paused). This tells the page it's
 * visible, keeps YouTube's activity clock fresh, routes the media keys to the video, and resumes it
 * if it stops without you pausing it (the overlay and media keys mark your pauses on the video).
 */
const KEEP_PLAYING = `const keepPlaying = () => {
    if (window.__shKeep) return
    window.__shKeep = true
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true)
      window.addEventListener('blur', (e) => e.stopImmediatePropagation(), true)
    } catch {}
    const current = () => document.querySelector('video[data-sh-pip]')
    const set = (action, handler) => { try { navigator.mediaSession.setActionHandler(action, handler) } catch {} }
    setInterval(() => {
      const v = current()
      if (!v) return
      window._lact = Date.now()
      document.querySelector('yt-confirm-dialog-renderer #confirm-button button, yt-confirm-dialog-renderer #confirm-button')?.click()
      // Players register their own media-key handlers as they go; keep ours, which mark your pauses.
      set('play', () => { delete v.dataset.shUserPaused; v.play().catch(() => {}) })
      set('pause', () => { v.dataset.shUserPaused = '1'; v.pause() })
      if (v.paused && !v.ended && !v.dataset.shUserPaused) v.play().catch(() => {})
    }, 1000)
  }`

/** Runs inside the player page: returns true once its video is playing, false while it isn't ready. */
const startPlaying = (startAt: number): string => `(async () => {
  const area = (v) => v.clientWidth * v.clientHeight
  const video = [...document.querySelectorAll('video')].filter((v) => v.readyState >= 2 && v.videoWidth > 0).sort((a, b) => area(b) - area(a))[0]
  if (!video) return false
  video.dataset.shPip = '1'
  // Resume a VOD where it was left (players ignore seeks before they have metadata).
  if (${startAt} > 0 && Math.abs(video.currentTime - ${startAt}) > 5) video.currentTime = ${startAt}
  video.muted = false
  await video.play().catch(() => {})
  ${KEEP_PLAYING}
  keepPlaying()
  return true
})()`

const CURRENT_TIME = `document.querySelector('video[data-sh-pip]')?.currentTime ?? null`

interface Pip {
  win: BrowserWindow
  url: string
  live: boolean
  /** Where it sat before being stashed at the side of the screen. */
  stashedFrom: { x: number; y: number } | null
  dragFrom: { x: number; y: number } | null
}

let current: Pip | null = null
let loadPipRenderer: ((win: BrowserWindow, query: Record<string, string>) => Promise<void>) | null = null

/** HLS streams (Kick) have no player page, so they play in the app's own `?view=pip` page. */
export function setPipRenderer(fn: typeof loadPipRenderer): void {
  loadPipRenderer = fn
}

/** Tells every app window which player URL is in PiP (null when none), so in-app copies can step aside. */
function broadcast(url: string | null): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && w !== current?.win) w.webContents.send('pip-state', url)
}

/** Closes the PiP window; resolves where its video had got to (null for none, or a live stream). */
export async function closePip(): Promise<number | null> {
  const was = current
  current = null
  if (!was) return null
  let at: number | null = null
  if (!was.win.isDestroyed()) {
    if (!was.live) at = await Promise.race([was.win.webContents.executeJavaScript(CURRENT_TIME).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 300))])
    if (!was.win.isDestroyed()) was.win.destroy()
  }
  broadcast(null)
  return typeof at === 'number' && Number.isFinite(at) ? at : null
}

/** Bottom-right of the screen the app is on, 16:9. */
function startBounds(): Electron.Rectangle {
  const anchor = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isVisible() && !w.isMinimized())
  const display = anchor ? screen.getDisplayMatching(anchor.getBounds()) : screen.getPrimaryDisplay()
  const area = display.workArea
  const width = Math.min(WIDTH, Math.round(area.width / 3))
  const height = Math.round((width * 9) / 16)
  return { x: area.x + area.width - width - MARGIN, y: area.y + area.height - height - MARGIN, width, height }
}

/**
 * Opens (or replaces) the PiP window for a player page URL, or for a direct HLS stream when `hls` is
 * set. `live` streams get no seeking controls. Resolves false if it couldn't start.
 */
export async function openPip({
  platform,
  url,
  hls = false,
  startAt = 0,
  live = false
}: {
  platform: Platform
  url: string
  hls?: boolean
  startAt?: number
  live?: boolean
}): Promise<boolean> {
  await closePip()
  const win = new BrowserWindow({
    ...startBounds(),
    show: false,
    frame: false,
    resizable: true,
    minWidth: 256,
    minHeight: 144,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    backgroundColor: '#000000',
    title: 'Picture in Picture',
    webPreferences: {
      ...(hls ? {} : { partition: partitionFor(platform, url, getSettings().blockTwitchAds) }),
      preload: PIP_PRELOAD,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false
    }
  })
  win.setAspectRatio(16 / 9)
  // Above full-screen apps too, and on every desktop / Space.
  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  const entry: Pip = { win, url, live, stashedFrom: null, dragFrom: null }
  current = entry
  win.on('closed', () => {
    if (current === entry) {
      current = null
      broadcast(null)
    }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('dom-ready', () => void win.webContents.insertCSS(VIDEO_ONLY_CSS).catch(() => {}))
  if (hls && loadPipRenderer) await loadPipRenderer(win, { src: url }).catch(() => {})
  else await win.loadURL(url).catch(() => {})

  // Players take a few seconds to buffer; keep asking until the video has frames. As a user gesture,
  // so it may start with sound.
  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline && current === entry && !win.isDestroyed()) {
    const started = await win.webContents.executeJavaScript(startPlaying(Math.max(0, Math.floor(startAt))), true).catch(() => false)
    if (started) {
      win.showInactive()
      broadcast(url)
      return true
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (current === entry) await closePip()
  return false
}

// ---------- The window's own controls (preload/pip.ts) ----------

const fromPip = (e: IpcMainEvent | Electron.IpcMainInvokeEvent): Pip | null =>
  current && !current.win.isDestroyed() && e.sender === current.win.webContents ? current : null

/** Slides the window to the nearer side of its screen, leaving a tab to bring it back; or back out. */
function toggleStash(pip: Pip): void {
  const { win } = pip
  const b = win.getBounds()
  if (pip.stashedFrom) {
    win.setPosition(pip.stashedFrom.x, pip.stashedFrom.y)
    pip.stashedFrom = null
    win.webContents.send('pip-stashed', null)
    return
  }
  const area = screen.getDisplayMatching(b).workArea
  const right = b.x + b.width / 2 > area.x + area.width / 2
  pip.stashedFrom = { x: b.x, y: b.y }
  win.setPosition(right ? area.x + area.width - STASH_VISIBLE : area.x - b.width + STASH_VISIBLE, b.y)
  win.webContents.send('pip-stashed', right ? 'right' : 'left')
}

export function registerPipControls(): void {
  ipcMain.handle('pip-info', (e) => {
    const pip = fromPip(e)
    return pip ? { live: pip.live } : null
  })
  ipcMain.on('pip-close', (e) => {
    if (fromPip(e)) void closePip()
  })
  ipcMain.on('pip-back', (e) => {
    if (!fromPip(e)) return
    void closePip()
    showMainWindow()
  })
  ipcMain.on('pip-stash', (e) => {
    const pip = fromPip(e)
    if (pip) toggleStash(pip)
  })
  ipcMain.on('pip-drag-start', (e) => {
    const pip = fromPip(e)
    if (!pip) return
    const [x, y] = pip.win.getPosition()
    pip.dragFrom = { x, y }
  })
  ipcMain.on('pip-drag', (e, dx: unknown, dy: unknown) => {
    const pip = fromPip(e)
    if (!pip?.dragFrom || typeof dx !== 'number' || typeof dy !== 'number' || !Number.isFinite(dx) || !Number.isFinite(dy)) return
    // Dragging a stashed window brings it back out.
    if (pip.stashedFrom) {
      pip.stashedFrom = null
      pip.win.webContents.send('pip-stashed', null)
    }
    pip.win.setPosition(Math.round(pip.dragFrom.x + dx), Math.round(pip.dragFrom.y + dy))
  })
  ipcMain.on('pip-drag-end', (e) => {
    const pip = fromPip(e)
    if (!pip) return
    pip.dragFrom = null
    // Keep it fully on screen (unless stashed on purpose).
    const b = pip.win.getBounds()
    const area = screen.getDisplayMatching(b).workArea
    const x = Math.min(Math.max(b.x, area.x), area.x + area.width - b.width)
    const y = Math.min(Math.max(b.y, area.y), area.y + area.height - b.height)
    if (x !== b.x || y !== b.y) pip.win.setPosition(x, y)
  })
}

// ---------- Picture in picture when the app is minimized or hidden ----------
// The video that's playing (in a stream's <webview>, or the app's own <video> for Kick's HLS videos)
// pauses in the app and carries on in the PiP window from the same point; when the window comes back,
// the PiP window closes and the app's copy carries on from where PiP got to.

/** Page-side: the main playing video (largest, preferring one with sound), or null. */
const PROBE = `(() => {
  const area = (v) => v.clientWidth * v.clientHeight
  const video = [...document.querySelectorAll('video')]
    .filter((v) => !v.paused && !v.ended && v.readyState >= 2 && v.videoWidth > 0)
    .sort((a, b) => Number(a.muted) - Number(b.muted) || area(b) - area(a))[0]
  if (!video) return null
  const yt = document.getElementById('movie_player')
  const ytLive = yt && typeof yt.getVideoData === 'function' ? yt.getVideoData().isLive : undefined
  return {
    muted: video.muted || video.volume === 0,
    area: area(video),
    time: video.currentTime,
    live: ytLive ?? (/[?&]channel=/.test(location.href) || !Number.isFinite(video.duration)),
    hls: video.dataset.hlsSrc || null
  }
})()`

const PAUSE = `document.querySelectorAll('video').forEach((v) => v.pause())`
const PLAY = `document.querySelectorAll('video').forEach((v) => v.play().catch(() => {}))`
const playFrom = (t: number): string => `(() => { const t = ${t}; const yt = document.getElementById('movie_player')
  if (yt && typeof yt.seekTo === 'function') { yt.seekTo(t, true); yt.playVideo && yt.playVideo(); return }
  const v = [...document.querySelectorAll('video')].filter((x) => x.duration > 0).sort((a, b) => b.duration - a.duration)[0]
  if (v) { v.currentTime = t; v.play().catch(() => {}) } })()`

interface Probe {
  muted: boolean
  area: number
  time: number
  live: boolean
  hls: string | null
}

/** The platform whose session a stream page uses (for reopening it in the PiP window). */
function platformOf(contents: WebContents): Platform | null {
  if (contents.session === session.fromPartition(TWITCH_PLAYER_PARTITION)) return 'twitch'
  return PLATFORMS.find((p) => contents.session === sessionFor(p)) ?? null
}

/** The in-app player auto-PiP took over, so it can carry on when the window comes back. */
let auto: { contents: WebContents; live: boolean; wasMuted: boolean } | null = null
let entering = false

async function enterAutoPip(win: BrowserWindow): Promise<void> {
  if (auto || current || entering || win.isDestroyed()) return
  entering = true
  try {
    // The app's own page (Kick videos) and every stream page embedded in it.
    const pages = [win.webContents, ...webContents.getAllWebContents().filter((c) => c.getType() === 'webview' && c.hostWebContents === win.webContents)]
    const probes = await Promise.all(pages.map((c) => c.executeJavaScript(PROBE).catch(() => null) as Promise<Probe | null>))
    const playing = pages
      .map((contents, i) => ({ contents, probe: probes[i] }))
      .filter((p): p is { contents: WebContents; probe: Probe } => Boolean(p.probe))
      .sort((a, b) => Number(a.probe.muted) - Number(b.probe.muted) || b.probe.area - a.probe.area)[0]
    if (!playing) return
    const { contents, probe } = playing
    const hls = contents === win.webContents
    const platform = hls ? 'kick' : platformOf(contents)
    const url = hls ? probe.hls : contents.getURL()
    if (!platform || !url || !/^https:\/\//.test(url)) return
    const mine = { contents, live: probe.live, wasMuted: contents.isAudioMuted() }
    auto = mine
    // Silent as well as paused: some players resume on their own.
    contents.setAudioMuted(true)
    await contents.executeJavaScript(PAUSE).catch(() => {})
    // Restoring the window while PiP is still loading closes it, which also ends up here.
    if (!(await openPip({ platform, url, hls, startAt: probe.live ? 0 : probe.time, live: probe.live })) && auto === mine) {
      auto = null
      contents.setAudioMuted(mine.wasMuted)
      await contents.executeJavaScript(PLAY).catch(() => {})
    }
  } finally {
    entering = false
  }
}

async function exitAutoPip(): Promise<void> {
  const was = auto
  if (!was) return
  auto = null
  const at = await closePip()
  if (was.contents.isDestroyed()) return
  was.contents.setAudioMuted(was.wasMuted)
  await was.contents.executeJavaScript(at !== null && !was.live ? playFrom(at) : PLAY).catch(() => {})
}

/** Moves the playing video to PiP while the main window is minimized or hidden (Settings → Playback). */
export function setupAutoPip(win: BrowserWindow): void {
  const leave = (): void => {
    if (getSettings().pipOnMinimize) void enterAutoPip(win)
  }
  const back = (): void => void exitAutoPip()
  win.on('minimize', leave)
  win.on('hide', leave)
  win.on('restore', back)
  win.on('show', back)
  win.on('focus', back)
}
