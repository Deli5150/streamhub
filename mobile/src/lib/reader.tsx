import { useSyncExternalStore } from 'react'
import { Platform as OS, StyleSheet, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import type { Platform } from '@shared/types'

// Mobile stand-in for the desktop's hidden reader windows: offscreen WebViews, one per platform and
// purpose, that load a platform page and run scripts in it. They share the app's cookie store with
// the sign-in screens and players, so they see the platforms signed in. <ReaderHost /> renders them
// (mounted once in the root layout); everything else goes through navigate() and evaluate().

/**
 * Twitch, YouTube and Rumble get the desktop site (the page scripts were written for it); Kick keeps
 * the WebView's own user agent, since Cloudflare ties its clearance cookie to the browser that got it.
 */
export const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
/**
 * Google's pages (YouTube sign-in and chat): the phone's own browser. Google refuses to sign in pages
 * that look like an app's embedded browser, which the WebView's own user agent does.
 */
export const GOOGLE_WEB_UA =
  OS.OS === 'ios'
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'

export const readerUserAgent = (p: Platform | null): string | undefined => (p === 'kick' || p === null ? undefined : DESKTOP_UA)

interface Slot {
  key: string
  /** null for work that isn't for a platform (e.g. measuring a wallpaper's brightness) */
  platform: Platform | null
  url: string
  /** Changes on every navigation, so loading the same URL again reloads the page. */
  nonce: number
}

interface Pending {
  resolve(value: unknown): void
  reject(err: Error): void
  timer: ReturnType<typeof setTimeout>
}

const slots = new Map<string, Slot>()
const webviews = new Map<string, { injectJavaScript(script: string): void }>()
const loadWaiters = new Map<string, (() => void)[]>()
const pending = new Map<string, Pending>()
const listeners = new Set<() => void>()
let snapshot: Slot[] = []
let mounted = 0
let nextId = 1

function changed(): void {
  snapshot = [...slots.values()]
  for (const l of listeners) l()
}

/** Whether a <ReaderHost /> is mounted (it isn't while the background task runs headless). */
export const readerAvailable = (): boolean => mounted > 0

/** Loads `url` in the slot's WebView and resolves once it has loaded (or after `timeoutMs` regardless). */
export function navigate(key: string, platform: Platform | null, url: string, timeoutMs = 20_000): Promise<void> {
  if (!readerAvailable()) return Promise.reject(new Error('page reader is not available'))
  const nonce = nextId++
  slots.set(key, { key, platform, url, nonce })
  changed()
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(done, timeoutMs)
    loadWaiters.set(`${key}#${nonce}`, [...(loadWaiters.get(`${key}#${nonce}`) ?? []), done])
  })
}

/** Current URL of a slot, if it has loaded one. */
export const slotUrl = (key: string): string | undefined => slots.get(key)?.url

/** Stops a slot's page (between reads, like the desktop loading about:blank). */
export function park(key: string): void {
  if (slots.delete(key)) changed()
}

/**
 * Runs `expression` (may be a promise) in the slot's page and resolves with its JSON result, or
 * null if the page isn't ready, the script throws, or nothing comes back within `timeoutMs`.
 */
export function evaluate<T>(key: string, expression: string, timeoutMs = 30_000): Promise<T | null> {
  const view = webviews.get(key)
  if (!view) return Promise.resolve(null)
  const id = String(nextId++)
  return new Promise<T | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve(null)
    }, timeoutMs)
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
    view.injectJavaScript(`(function () {
      var post = function (m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)) };
      Promise.resolve()
        .then(function () { return (${expression}) })
        .then(function (r) { post({ __sh: ${JSON.stringify(id)}, r: r === undefined ? null : r }) },
              function (e) { post({ __sh: ${JSON.stringify(id)}, r: null, e: String((e && e.message) || e) }) });
    })(); true;`)
  })
}

function onMessage(e: WebViewMessageEvent): void {
  let msg: { __sh?: string; r?: unknown; e?: string }
  try {
    msg = JSON.parse(e.nativeEvent.data)
  } catch {
    return
  }
  const p = msg.__sh ? pending.get(msg.__sh) : undefined
  if (!p || !msg.__sh) return
  clearTimeout(p.timer)
  pending.delete(msg.__sh)
  p.resolve(msg.r ?? null)
}

function onLoaded(slot: Slot): void {
  const k = `${slot.key}#${slot.nonce}`
  const waiters = loadWaiters.get(k)
  loadWaiters.delete(k)
  for (const w of waiters ?? []) w()
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The offscreen reader WebViews. Mount once, near the root. */
export function ReaderHost(): React.JSX.Element {
  const active = useSyncExternalStore(subscribe, () => snapshot)
  return (
    <View
      style={styles.host}
      pointerEvents="none"
      ref={(v) => {
        // Counted by ref so a remount (fast refresh) never leaves the reader marked unavailable.
        if (v) mounted++
        else mounted = Math.max(0, mounted - 1)
      }}
    >
      {active.map((slot) => (
        <WebView
          key={`${slot.key}#${slot.nonce}`}
          ref={(w) => {
            if (w) webviews.set(slot.key, w)
            else if (webviews.get(slot.key) && !slots.has(slot.key)) webviews.delete(slot.key)
          }}
          source={{ uri: slot.url }}
          userAgent={readerUserAgent(slot.platform)}
          style={styles.page}
          onMessage={onMessage}
          onLoadEnd={() => onLoaded(slot)}
          // Pages are never shown: keep their media silent and let them play without a tap.
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          injectedJavaScriptBeforeContentLoaded={MUTE_MEDIA}
        />
      ))}
    </View>
  )
}

/** Keeps any video/audio a reader page starts muted. */
const MUTE_MEDIA = `(function () {
  var mute = function () { document.querySelectorAll('video, audio').forEach(function (m) { m.muted = true }) };
  document.addEventListener('play', mute, true);
  setInterval(mute, 2000);
})(); true;`

const styles = StyleSheet.create({
  // Desktop-sized and laid out (lists only load what's on screen), but invisible and untouchable.
  host: { position: 'absolute', left: 0, top: 0, width: 1280, height: 900, opacity: 0, zIndex: -1 },
  page: { position: 'absolute', left: 0, top: 0, width: 1280, height: 900, backgroundColor: 'transparent' }
})
