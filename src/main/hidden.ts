import { BrowserWindow } from 'electron'
import path from 'node:path'
import type { Platform } from '@shared/types'
import { AuthError, partition, sessionFor } from './net'

// Some sites (Twitch, YouTube) only expose your follows through their signed-in web pages. This loads
// such a page in an invisible window on the platform's session and runs a read-only script against it.

/**
 * Separate windows per purpose, so a slow follows scroll never delays a live-status check, and
 * background preloads of channel pages (bg-*) never delay a page you just opened.
 */
export type Slot = 'live' | 'follows' | 'videos' | 'clips' | 'bg-videos' | 'bg-clips' | 'keepalive'

const windows = new Map<string, BrowserWindow>()
const queues = new Map<string, Promise<unknown>>()
/** webContents ids of reader windows; their images/media/fonts are blocked to make pages load faster. */
const readerIds = new Set<number>()
const blockerInstalled = new Set<Platform>()

const BLOCKED_TYPES = new Set(['image', 'media', 'font'])

function installBlocker(p: Platform): void {
  if (blockerInstalled.has(p)) return
  blockerInstalled.add(p)
  // Only requests from reader windows are cancelled; visible players and chat are untouched.
  sessionFor(p).webRequest.onBeforeRequest((details, cb) => {
    const blocked = details.webContentsId !== undefined && readerIds.has(details.webContentsId) && BLOCKED_TYPES.has(details.resourceType)
    cb({ cancel: blocked })
  })
}

function windowFor(p: Platform, slot: Slot): BrowserWindow {
  const key = `${p}:${slot}`
  let win = windows.get(key)
  if (!win || win.isDestroyed()) {
    installBlocker(p)
    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: { partition: partition(p), backgroundThrottling: false, preload: path.join(__dirname, '../preload/reader.js') }
    })
    const id = win.webContents.id
    // Live/follows reads don't need images; channel-page reads do (thumbnails come from the page).
    if (slot === 'live' || slot === 'follows' || slot === 'keepalive') readerIds.add(id)
    win.on('closed', () => readerIds.delete(id))
    win.webContents.setAudioMuted(true)
    windows.set(key, win)
  }
  return win
}

/** Result a page script returns when it can tell the user isn't signed in. */
export const SIGNED_OUT = '__signed_out__'

/**
 * Loads `url` and re-runs `script` (an expression, may be async) every 500ms until it returns
 * something other than null/undefined. Calls for the same platform and slot run one at a time.
 */
export function readPage<T>(p: Platform, slot: Slot, url: string, script: string, timeoutMs = 45_000): Promise<T> {
  const key = `${p}:${slot}`
  const run = async (): Promise<T> => {
    const win = windowFor(p, slot)
    const started = Date.now()
    try {
      // SPAs often redirect during load, which rejects with ERR_ABORTED even though the page is fine.
      await win.loadURL(url).catch(() => {})
      const deadline = started + timeoutMs
      while (Date.now() < deadline) {
        const result = await win.webContents.executeJavaScript(script, true).catch(() => null)
        if (result === SIGNED_OUT) throw new AuthError(`${p}: signed out`)
        if (result !== null && result !== undefined) {
          console.log(`[${p}] read ${new URL(url).pathname} in ${((Date.now() - started) / 1000).toFixed(1)}s`)
          return result as T
        }
        await new Promise((r) => setTimeout(r, 500))
      }
      throw new Error(`${p}: ${new URL(url).pathname} didn't finish loading`)
    } finally {
      // Stop the page's scripts between reads.
      if (!win.isDestroyed()) win.loadURL('about:blank').catch(() => {})
    }
  }
  const next = (queues.get(key) ?? Promise.resolve()).then(run, run)
  queues.set(key, next.catch(() => {}))
  return next
}

/**
 * Opens `url` in an invisible window on the platform's session for `ms`, then leaves it: the site
 * runs as it does in a browser tab, which is when sites renew their sign-in cookies.
 */
export function visitPage(p: Platform, url: string, ms = 8_000): Promise<void> {
  const key = `${p}:keepalive`
  const run = async (): Promise<void> => {
    const win = windowFor(p, 'keepalive')
    try {
      await win.loadURL(url).catch(() => {})
      await new Promise((r) => setTimeout(r, ms))
    } finally {
      if (!win.isDestroyed()) win.loadURL('about:blank').catch(() => {})
      await sessionFor(p).cookies.flushStore().catch(() => {})
    }
  }
  const next = (queues.get(key) ?? Promise.resolve()).then(run, run)
  queues.set(key, next.catch(() => {}))
  return next
}
