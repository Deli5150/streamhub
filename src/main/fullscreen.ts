import { BrowserWindow, type WebContents } from 'electron'

// A player's own fullscreen button (the HTML fullscreen API, in a <webview> or the app's page) takes
// the whole window fullscreen. Electron is meant to undo that when the page leaves fullscreen, but on
// Windows it sometimes doesn't: pressing Esc, or the queue moving on to the next video (the player is
// replaced while fullscreen), left the window stuck fullscreen with no way to move or resize it.
// This puts the window back whenever no page is fullscreen any more, unless the app itself asked for
// fullscreen (Big Picture).

/** Windows the app made fullscreen on purpose (Big Picture); those stay fullscreen. */
const wanted = new Set<number>()
/** webContents ids currently fullscreen through the HTML API, per window. */
const pages = new Map<number, Set<number>>()

export function setAppFullScreen(win: BrowserWindow, on: boolean): void {
  if (on) wanted.add(win.id)
  else wanted.delete(win.id)
  win.setFullScreen(on)
}

// macOS keeps its own fullscreen Spaces in order (and the user may have made the window fullscreen
// themselves), so only Windows and Linux get the extra help. STREAMHUB_FULLSCREEN_GUARD=1 turns it
// on anywhere, for testing.
const NEEDS_GUARD = process.platform !== 'darwin' || process.env.STREAMHUB_FULLSCREEN_GUARD === '1'

/** Leaves fullscreen if nothing should be holding it, after Chromium has had a moment to settle. */
function release(win: BrowserWindow): void {
  setTimeout(() => {
    if (win.isDestroyed() || wanted.has(win.id) || pages.get(win.id)?.size) return
    if (!win.isFullScreen()) return
    console.log('[fullscreen] no player is fullscreen any more — leaving fullscreen')
    win.setFullScreen(false)
  }, 250)
}

/**
 * A player is going away (the queue moved on to the next video, or its screen closed). Whatever
 * fullscreen it had goes with it: Windows never says so when a fullscreen player is removed, and
 * the window stayed fullscreen with no way out.
 */
export function playerClosed(win: BrowserWindow): void {
  if (!NEEDS_GUARD || win.isDestroyed() || wanted.has(win.id)) return
  pages.get(win.id)?.clear()
  if (win.isFullScreen()) {
    console.log('[fullscreen] a player closed while the window was fullscreen — leaving fullscreen')
    win.setFullScreen(false)
  }
}

/** Watches one webContents (the app's page or a player <webview>) shown in `win`. */
export function guardFullScreen(win: BrowserWindow, contents: WebContents): void {
  if (!NEEDS_GUARD) return
  const id = contents.id
  const active = (): Set<number> => pages.get(win.id) ?? pages.set(win.id, new Set()).get(win.id)!
  contents.on('enter-html-full-screen', () => active().add(id))
  contents.on('leave-html-full-screen', () => {
    active().delete(id)
    release(win)
  })
  // Esc always means "leave fullscreen", even when the page never reports that it left.
  contents.on('before-input-event', (_, input) => {
    if (input.type !== 'keyDown' || input.key !== 'Escape' || win.isDestroyed() || !win.isFullScreen() || wanted.has(win.id)) return
    active().delete(id)
    contents.executeJavaScript('document.fullscreenElement && document.exitFullscreen().catch(() => {})', true).catch(() => {})
    release(win)
  })
  // A player removed while fullscreen (the next video in the queue) never says it left.
  contents.once('destroyed', () => {
    if (!active().delete(id)) return
    if (!win.isDestroyed()) release(win)
  })
}

/** The window a <webview>'s guest page is shown in. */
export const windowOf = (contents: WebContents): BrowserWindow | null =>
  BrowserWindow.fromWebContents(contents.hostWebContents ?? contents)
