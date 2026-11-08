import { app, BrowserWindow, ipcMain, nativeImage, session, shell, systemPreferences } from 'electron'
import path from 'node:path'
import { PLATFORMS, type MediaCategory, type Platform, type Settings } from '@shared/types'
import { setupAppMenu } from './appMenu'
import { actions, emit, pollSignedOutMembers, setPhoneSignIn, showMainWindow, start, state } from './hub'
import { cleanSaved } from './watchLater'
import { checkForUpdates, downloadUpdate, installUpdate, isSteamCopy, startUpdater } from './updater'
import { cancelPhoneSignIn, signInOnPhone } from './googleAuth'
import { normalizeBindings } from '@shared/shortcuts'
import { hasTray, hidePopup, initMenubar, syncMenubar } from './menubar'
import { browserUserAgent, partition, sessionFor } from './net'
import { closePip, openPip, registerPipControls, setPipRenderer, setupAutoPip } from './pip'
import { youtubeChapters } from './providers/youtube'
import { syncNow, syncOnFocus, syncSignIn, syncSignOut } from './sync'
import { installTwitchAdFilter } from './twitchAds'
import { TWITCH_PLAYER_PARTITION } from '@shared/urls'
import { applyNativeTheme, getSettings, onSettingsChange, updateSettings, validateShortcuts } from './settings'

// Embedded players (notably Rumble's) otherwise wait for a click inside the webview before playing.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const ALLOWED_PARTITIONS = new Set([...PLATFORMS.map(partition), TWITCH_PLAYER_PARTITION])
const ICON = path.join(__dirname, '../../resources/icon.png')
const isMac = process.platform === 'darwin'
/**
 * Open in Big Picture this time: `--big-picture` on the command line, or launched from Steam's
 * Game Mode (gamepad UI, e.g. on a Steam Deck), where there's only a controller.
 */
const LAUNCH_BIG_PICTURE = process.argv.includes('--big-picture') || process.env.SteamGamepadUI === '1' || process.env.XDG_CURRENT_DESKTOP === 'gamescope'
/**
 * Big Picture is the whole app: the copy the Steam installer put in your Steam library (made for the
 * TV and the controller, with its own Settings screen). `--big-picture-only` or
 * STREAMHUB_BIG_PICTURE_ONLY=1 does the same anywhere (for trying it out).
 */
const BIG_PICTURE_ONLY = isSteamCopy() || process.argv.includes('--big-picture-only') || process.env.STREAMHUB_BIG_PICTURE_ONLY === '1'
const PRELOAD = path.join(__dirname, '../preload/index.js')
let mainWindow: BrowserWindow | null = null

/** Loads the renderer bundle; `view` selects an alternate root (e.g. the menu-bar popup). */
function loadRenderer(win: BrowserWindow, view?: string, extra: Record<string, string> = {}): Promise<void> {
  const query = view ? { view, ...extra } : extra
  if (process.env.ELECTRON_RENDERER_URL) {
    const qs = new URLSearchParams(query).toString()
    return win.loadURL(process.env.ELECTRON_RENDERER_URL + (qs ? `?${qs}` : ''))
  }
  return win.loadFile(path.join(__dirname, '../renderer/index.html'), { query })
}

function setupSessions(): void {
  const ua = browserUserAgent()
  app.userAgentFallback = ua
  for (const p of PLATFORMS) sessionFor(p).setUserAgent(ua)
  installTwitchAdFilter(ua)

  // Kick's clip host sends no CORS header, so the app's own <video> (hls.js, or native HLS when the UI
  // is served over http in dev) can't read clip playlists. Allow them for the app's session.
  session.defaultSession.webRequest.onHeadersReceived({ urls: ['https://clips.kick.com/*'] }, (details, cb) => {
    const headers = details.responseHeaders ?? {}
    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'access-control-allow-origin')) headers['Access-Control-Allow-Origin'] = ['*']
    cb({ responseHeaders: headers })
  })

  // YouTube's embed player rejects playback (error 153) without a referrer identifying the embedder.
  sessionFor('youtube').webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube.com/embed/*'] }, (details, cb) => {
    details.requestHeaders.Referer ||= 'https://streamhub.app/'
    cb({ requestHeaders: details.requestHeaders })
  })
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 560,
    title: 'StreamHub',
    icon: ICON,
    // macOS: translucent window over the native material, like the Glaze app.
    ...(isMac
      ? { vibrancy: 'under-window' as const, visualEffectState: 'active' as const, backgroundColor: '#00000000' }
      : { backgroundColor: '#1c1c1e' }),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 15 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      webviewTag: true
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  loadRenderer(win)
  mainWindow = win
  setupAutoPip(win)
  win.on('focus', syncOnFocus)
  // Windows/Linux: with the tray on, closing the window hides it to the tray (as tray apps do there),
  // so the app keeps running and reopens instantly; quitting from the tray menu really quits.
  win.on('close', (e) => {
    if (!isMac && !quitting && hasTray()) {
      e.preventDefault()
      win.hide()
    }
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  return win
}

app.on('web-contents-created', (_, contents) => {
  // Only allow <webview>s on the per-platform partitions, and never with a preload script.
  contents.on('will-attach-webview', (e, prefs, params) => {
    delete prefs.preload
    prefs.nodeIntegration = false
    prefs.contextIsolation = true
    if (!ALLOWED_PARTITIONS.has(params.partition) || !/^https:\/\//.test(params.src)) e.preventDefault()
  })
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) shell.openExternal(url)
      return { action: 'deny' }
    })
  }
})

const isPlatform = (p: unknown): p is Platform => PLATFORMS.includes(p as Platform)

function registerIpc(): void {
  ipcMain.handle('state', () => state())
  ipcMain.handle('login', (_, p) => isPlatform(p) && actions.login(p))
  ipcMain.handle('logout', (_, p) => isPlatform(p) && actions.logout(p))
  ipcMain.handle('refresh', () => actions.refresh())
  ipcMain.handle('channel-page', (_, key: string) => actions.getChannelPage(String(key)))
  ipcMain.handle('load-more', (_, key: string, category: MediaCategory, cursor: string) =>
    ['streams', 'videos', 'clips'].includes(category) ? actions.loadMore(String(key), category, String(cursor)) : { items: [], cursor: null }
  )
  ipcMain.handle('channel-about', (_, key: string) => actions.getAbout(String(key)))
  ipcMain.handle('channel-together', (_, key: string) => actions.getTogether(String(key)))
  ipcMain.handle('toggle-mute', (_, key: string) => actions.toggleMute(String(key)))
  ipcMain.handle('accent-color', () =>
    isMac || process.platform === 'win32' ? `#${systemPreferences.getAccentColor().slice(0, 6)}` : null
  )
  ipcMain.handle('open-external', (_, url: string) => /^https:\/\//.test(url) && shell.openExternal(url))
  ipcMain.handle('update-settings', (_, patch: Partial<Settings>) => {
    // Shortcuts go through set-shortcuts (validated); everything else is merged as-is.
    const { shortcuts: _ignored, ...rest } = patch ?? {}
    updateSettings(rest)
  })
  ipcMain.handle('set-shortcuts', (_, bindings: unknown) => {
    const clean = normalizeBindings(bindings)
    const error = validateShortcuts(clean)
    if (error) return { success: false, error }
    updateSettings({ shortcuts: clean })
    return { success: true }
  })
  ipcMain.handle('open-pip', (_, t: { platform?: unknown; url?: unknown; hls?: unknown; startAt?: unknown; live?: unknown }) => {
    if (!isPlatform(t?.platform) || typeof t.url !== 'string' || !/^https:\/\//.test(t.url)) return false
    return openPip({ platform: t.platform, url: t.url, hls: t.hls === true, startAt: Number(t.startAt) || 0, live: t.live === true })
  })
  ipcMain.handle('menubar-pick', (_, key: string) => {
    hidePopup()
    return actions.pickFromMenubar(String(key))
  })
  ipcMain.handle('menubar-hide', () => hidePopup())
  ipcMain.handle('close-pip', () => void closePip())
  ipcMain.handle('launch-big-picture', () => LAUNCH_BIG_PICTURE || BIG_PICTURE_ONLY)
  ipcMain.handle('big-picture-only', () => BIG_PICTURE_ONLY)
  ipcMain.handle('quit-app', () => app.quit())
  // Google sign-in (Sync, or YouTube) approved on a phone: the code to show goes out in the state.
  ipcMain.handle('google-phone-signin', (_, target: unknown) => {
    const what = target === 'sync' ? 'sync' : 'youtube'
    return signInOnPhone(
      (code) => setPhoneSignIn({ target: what, ...code }),
      () => (what === 'sync' ? syncSignIn() : actions.login('youtube'))
    ).finally(() => setPhoneSignIn(null))
  })
  ipcMain.handle('google-phone-cancel', () => cancelPhoneSignIn())
  ipcMain.handle('set-fullscreen', (e, on: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win && !win.isDestroyed()) win.setFullScreen(on === true)
  })
  ipcMain.handle('saved-toggle', (_, item: unknown) => {
    const clean = cleanSaved(item)
    if (clean) actions.saved.toggle(clean)
  })
  ipcMain.handle('saved-remove', (_, id: string) => actions.saved.remove(String(id)))
  ipcMain.handle('update-check', () => checkForUpdates())
  ipcMain.handle('update-download', () => downloadUpdate())
  ipcMain.handle('update-install', () => installUpdate())
  ipcMain.handle('yt-playlists-list', () => actions.playlists.list())
  ipcMain.handle('yt-playlists-import', (_, ids: unknown) => actions.playlists.import(Array.isArray(ids) ? ids.map(String) : []))
  ipcMain.handle('yt-playlists-refresh', (_, id?: string) => actions.playlists.refresh(id ? String(id) : undefined))
  ipcMain.handle('yt-playlists-remove', (_, id: string) => actions.playlists.remove(String(id)))
  ipcMain.handle('saved-reorder', (_, sourceId: string, targetId: string) => actions.saved.reorder(String(sourceId), String(targetId)))
  ipcMain.handle('video-chapters', (_, platform: unknown, mediaId: unknown) =>
    platform === 'youtube' && typeof mediaId === 'string' && /^[\w-]{11}$/.test(mediaId) ? youtubeChapters(mediaId) : []
  )
  ipcMain.handle('sync-sign-in', () => syncSignIn())
  ipcMain.handle('sync-sign-out', () => syncSignOut())
  ipcMain.handle('sync-now', () => syncNow())
  registerPipControls()
}

onSettingsChange((next, prev) => {
  if (next.theme !== prev.theme) applyNativeTheme(next.theme)
  // A newly combined channel's other members may be on a platform not signed in here.
  if (JSON.stringify(next.combined) !== JSON.stringify(prev.combined)) void pollSignedOutMembers(true)
  if (JSON.stringify(next.shortcuts) !== JSON.stringify(prev.shortcuts)) setupAppMenu(() => mainWindow)
  if (JSON.stringify(next.shortcuts) !== JSON.stringify(prev.shortcuts) || JSON.stringify(next.menubar) !== JSON.stringify(prev.menubar))
    syncMenubar()
  emit()
})

app.whenReady().then(() => {
  setupSessions()
  if (isMac) app.dock?.setIcon(nativeImage.createFromPath(ICON))
  registerIpc()
  applyNativeTheme(getSettings().theme)
  setupAppMenu(() => mainWindow)
  const win = createWindow()
  start(win)
  startUpdater(emit)
  setPipRenderer((win, query) => loadRenderer(win, 'pip', query))
  initMenubar({
    preload: PRELOAD,
    loadRenderer,
    showMain: () => (mainWindow ? showMainWindow() : start(createWindow()))
  })
  app.on('activate', () => {
    if (!mainWindow) start(createWindow())
  })
})

let quitting = false
app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  // Like macOS, keep running (live alerts, tray popup) in the Windows/Linux system tray while it's on;
  // "Open StreamHub" in the tray brings the window back and "Quit StreamHub" quits.
  if (process.platform !== 'darwin' && !hasTray()) app.quit()
})
