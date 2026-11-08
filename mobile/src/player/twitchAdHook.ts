import type * as AdFilter from '../../../src/shared/twitchAdFilter'

// Twitch ad blocking on the phone. The desktop filters the Twitch player's network traffic; a phone
// web view can't, so the same filter (shared/twitchAdFilter.ts) runs inside the player page instead,
// wrapped around the page's fetch() and around the Web Workers the player loads playlists in.
//
// Both functions below run inside web pages (see Player.tsx), so like the page scripts they must be
// fully self-contained. scripts/gen-page-scripts.mjs saves their source, and the filter's, as text.
//
// The player can play a stream three ways, and the hook reports which ('mode'):
// - 'worker' / 'page': the player fetches playlists itself (Android, and iPhones where Twitch uses
//   Media Source), so ad breaks are filtered exactly as on the desktop.
// - 'native': the player hands the stream URL to the system's own video player (some iPhones), whose
//   requests no page script can see. The stream is then switched to an access token of a kind that
//   is usually served without ads (see BACKUP_TYPES); ad breaks in it can't be filtered further.

type Lib = typeof AdFilter
type Message = { mode: string } | { log: string }

interface WorkerScope {
  fetch: typeof fetch
  postMessage(message: unknown): void
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void
}

/** Wraps fetch so usher and media playlists go through `filter` (passed into both hooks below). */
export function filteredFetch(lib: Lib, realFetch: typeof fetch, filter: AdFilter.TwitchAdFilter, onPlaylist: () => void): typeof fetch {
  return async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (lib.isGql(url) && typeof init?.body === 'string') {
      const h = new Headers(init.headers)
      filter.rememberTokenRequest((name) => h.get(name), init.body)
    }
    const res = await realFetch(input, init)
    const usher = lib.isUsher(url)
    if (!res.ok || (!usher && !lib.isMediaPlaylist(url))) return res
    const text = await res.text()
    let body = text
    if (usher) filter.onMaster(url, text)
    else body = await filter.onMediaPlaylist(url, text)
    onPlaylist()
    const headers = new Headers(res.headers)
    headers.delete('content-length')
    headers.delete('content-encoding')
    const out = new Response(body, { status: res.status, statusText: res.statusText, headers })
    // Players resolve relative segment URLs against the playlist's own URL.
    Object.defineProperty(out, 'url', { value: res.url })
    return out
  }
}

/** Runs first in every Web Worker the Twitch player starts. */
export function twitchAdWorkerHook(lib: Lib, makeFetch: typeof filteredFetch): void {
  const scope = self as unknown as WorkerScope
  const post = (m: Message): void => scope.postMessage({ __shAd: m })
  const realFetch = scope.fetch.bind(scope)
  const filter = lib.createTwitchAdFilter((input, init) => realFetch(input, init), (log) => post({ log }))
  let reported = false
  scope.fetch = makeFetch(lib, realFetch, filter, () => {
    if (!reported) post({ mode: 'worker' })
    reported = true
  })
  // Token headers seen by the page (the player usually asks for its token there).
  scope.addEventListener('message', (e) => {
    const t = (e.data as { __shAdToken?: { login: string; headers: Record<string, string> } } | null)?.__shAdToken
    if (!t) return
    e.stopImmediatePropagation()
    filter.setTokenHeaders(t.login, t.headers)
  })
}

/** Runs at the start of the Twitch player page. */
export function twitchAdPageHook(lib: Lib, makeFetch: typeof filteredFetch, workerPrelude: string): void {
  const w = window as unknown as {
    __shAdHook?: boolean
    ReactNativeWebView?: { postMessage(m: string): void }
    Worker: typeof Worker
    fetch: typeof fetch
  }
  if (w.__shAdHook) return
  w.__shAdHook = true
  const report = (m: Message): void => w.ReactNativeWebView?.postMessage(JSON.stringify({ __twitchAds: m }))
  // Page errors go to the app's log, so a player that stops working says why.
  window.addEventListener('error', (e) => report({ log: `page error: ${e.message}` }))
  const realFetch = window.fetch.bind(window)
  const filter = lib.createTwitchAdFilter((input, init) => realFetch(input, init), (log) => report({ log }))
  const workers: Worker[] = []
  const tokens = new Map<string, Record<string, string>>()
  let mode: string | null = null
  const setMode = (m: string): void => {
    if (mode === m) return
    mode = m
    report({ mode: m })
  }

  // The player's own access-token request: keep its headers for backup tokens, here and in workers.
  const rememberToken = (h: Headers, body: string): void => {
    try {
      const parsed = JSON.parse(body) as unknown
      for (const op of (Array.isArray(parsed) ? parsed : [parsed]) as { operationName?: string; variables?: { login?: string; isLive?: boolean } }[]) {
        const login = op?.variables?.login
        if (!op?.operationName?.startsWith('PlaybackAccessToken') || !op.variables?.isLive || !login) continue
        const kept: Record<string, string> = {}
        for (const name of lib.FORWARDED_HEADERS) {
          const v = h.get(name)
          if (v) kept[name] = v
        }
        tokens.set(login.toLowerCase(), kept)
        for (const worker of workers) worker.postMessage({ __shAdToken: { login, headers: kept } })
      }
    } catch {
      // not JSON: not a token request
    }
  }
  const pageFetch = makeFetch(lib, realFetch, filter, () => setMode('page'))
  w.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (lib.isGql(url) && typeof init?.body === 'string') rememberToken(new Headers(init.headers), init.body)
    return pageFetch(input, init)
  } as typeof fetch

  // Every classic worker starts with the filter in it, then runs its own script.
  const RealWorker = window.Worker
  const Wrapped = function (this: unknown, url: string | URL, options?: WorkerOptions): Worker {
    if (options?.type === 'module') return new RealWorker(url, options)
    let worker: Worker
    try {
      const src = new URL(String(url), location.href).href
      // Twitch starts its video worker from a temporary blob: address and frees it right away, so
      // its script is read now (synchronously, before that happens) rather than loaded by the
      // worker later, when the address would already be gone and the video would never start.
      let body = `importScripts(${JSON.stringify(src)});`
      if (src.startsWith('blob:')) {
        const xhr = new XMLHttpRequest()
        xhr.open('GET', src, false)
        xhr.send()
        body = xhr.responseText
      }
      const blob = new Blob([`${workerPrelude}\n${body}`], { type: 'application/javascript' })
      worker = new RealWorker(URL.createObjectURL(blob), options)
    } catch (e) {
      report({ log: `worker not filtered (${(e as Error)?.message ?? e}); starting it as is` })
      return new RealWorker(url, options)
    }
    worker.addEventListener('error', (e: ErrorEvent) => report({ log: `worker error: ${e.message}` }))
    // Added before the player's own listeners, so the filter's messages never reach them.
    worker.addEventListener('message', (e: MessageEvent) => {
      const m = (e.data as { __shAd?: Message } | null)?.__shAd
      if (!m) return
      e.stopImmediatePropagation()
      if ('mode' in m) setMode(m.mode)
      else report(m)
    })
    for (const [login, headers] of tokens) worker.postMessage({ __shAdToken: { login, headers } })
    workers.push(worker)
    return worker
  } as unknown as typeof Worker
  Wrapped.prototype = RealWorker.prototype
  w.Worker = Wrapped

  // The system's own player (see the top of this file): switch to a token kind usually without ads.
  const proto = HTMLMediaElement.prototype
  const srcProp = Object.getOwnPropertyDescriptor(proto, 'src')
  if (!srcProp?.set || !srcProp.get) return
  const switching = new WeakSet<HTMLMediaElement>()
  // Ask for that stream as soon as the page opens, alongside the player's own start-up, so it's
  // usually ready by the time the player hands its stream over and can be used from the start
  // (no second load).
  const login = new URLSearchParams(location.search).get('channel')?.toLowerCase()
  let prepared: string | null = null
  if (login) {
    const usher = `https://usher.ttvnw.net/api/channel/hls/${encodeURIComponent(login)}.m3u8?allow_source=true&fast_bread=true&player_backend=mediaplayer&playlist_include_framerate=true&reassignments_supported=true&supported_codecs=avc1&cdm=wv`
    filter
      .backupMasterUrl(usher, lib.BACKUP_TYPES[0])
      .then((url) => (prepared = url))
      .catch(() => undefined)
  }
  /** The prepared stream for an usher URL of the same channel, if it's ready. */
  const preparedFor = (url: string): string | null => (prepared && lib.isUsher(url)?.[1].toLowerCase() === login ? prepared : null)
  const native = (media: HTMLMediaElement, url: string): void => {
    if (!lib.isUsher(url) || switching.has(media)) return
    setMode('native')
    switching.add(media)
    filter
      .backupMasterUrl(url, lib.BACKUP_TYPES[0])
      .then((backup) => {
        if (!backup || srcProp.get!.call(media) !== url) return
        const playing = !media.paused
        srcProp.set!.call(media, backup)
        report({ log: `system player: switched to the ${lib.typeName(lib.BACKUP_TYPES[0])} stream` })
        if (playing) void media.play().catch(() => undefined)
      })
      .catch(() => undefined)
      .finally(() => switching.delete(media))
  }
  /** Hands the system player the prepared stream when it's ready; otherwise switches once it is. */
  const assign = (media: HTMLMediaElement, value: string, set: (v: string) => void): void => {
    const ready = preparedFor(value)
    if (ready) {
      setMode('native')
      set(ready)
      report({ log: `system player: started on the ${lib.typeName(lib.BACKUP_TYPES[0])} stream` })
      return
    }
    set(value)
    native(media, value)
  }
  Object.defineProperty(proto, 'src', {
    ...srcProp,
    set(this: HTMLMediaElement, value: string) {
      assign(this, String(value), (v) => srcProp.set!.call(this, v))
    }
  })
  const setAttribute = Element.prototype.setAttribute
  proto.setAttribute = function (this: HTMLMediaElement, name: string, value: string) {
    if (name.toLowerCase() === 'src') assign(this, String(value), (v) => setAttribute.call(this, name, v))
    else setAttribute.call(this, name, value)
  }
}
