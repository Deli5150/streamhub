import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { TWITCH_AD_SCRIPT } from '../src/player/twitchAds'

// Runs the injected ad-blocking script the way the phone does — as source text, in a fresh global
// scope — against a fake Twitch player page and a fake Twitch.

const USHER = 'https://usher.ttvnw.net/api/channel/hls/somechannel.m3u8?sig=a&token=b'
const PLAYER_720 = 'https://use15.playlist.ttvnw.net/v1/playlist/player-720.m3u8'
const BACKUP_720 = 'https://use15.playlist.ttvnw.net/v1/playlist/backup-720.m3u8'
const master = (url: string): string => ['#EXTM3U', '#EXT-X-STREAM-INF:BANDWIDTH=3400000,RESOLUTION=1280x720,FRAME-RATE=60.000', url].join('\n')
const head = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:10'
const seg = (copy: string, t: number, title = 'live'): string =>
  `#EXT-X-PROGRAM-DATE-TIME:2026-11-02T10:00:0${t}.000Z\n#EXTINF:2.000,${title}\nhttps://video-edge.example/${copy}${t}.ts`
const adBreak = '#EXT-X-DATERANGE:ID="stitched-ad-1",CLASS="twitch-stitched-ad",DURATION=30'

/** Fake Twitch: the embed token kind works and its copy is ad-free. Records GQL request headers. */
function fakeTwitch(): { fetch: typeof fetch; gqlHeaders: Record<string, string>[] } {
  const gqlHeaders: Record<string, string>[] = []
  const twitchFetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.startsWith('https://gql.twitch.tv/gql')) {
      gqlHeaders.push(Object.fromEntries(new Headers(init?.headers)))
      const embed = JSON.parse(String(init?.body)).variables?.playerType === 'embed'
      return new Response(JSON.stringify({ data: { streamPlaybackAccessToken: embed ? { value: 'tok', signature: 'sig' } : null } }))
    }
    if (url === USHER) return new Response(master(PLAYER_720))
    if (url.startsWith('https://usher.ttvnw.net/')) return new Response(master(BACKUP_720))
    if (url === PLAYER_720) return new Response([head, seg('p', 2), adBreak, seg('p', 3, 'Amazon')].join('\n'))
    if (url === BACKUP_720) return new Response([head, seg('b', 3), seg('b', 4)].join('\n'))
    return new Response('', { status: 404 })
  }) as typeof fetch
  return { fetch: twitchFetch, gqlHeaders }
}

const globals = { Headers, Response, Request, URL, URLSearchParams, Blob, Promise, JSON, Map, Set, WeakSet, Date, Math, RegExp, Object, Array, Number, String, Error, setTimeout, clearTimeout, console }
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 20))

/** A fake player page with the script injected; returns what it reported and the workers it made. */
async function page() {
  const twitch = fakeTwitch()
  const reported: unknown[] = []
  const blobs = new Map<string, Blob>()
  /** Script text of blob: addresses the "player" made, readable synchronously like a real page. */
  const blobText = new Map<string, string>()
  class FakeXHR {
    responseText = ''
    private url = ''
    open(_method: string, url: string, async: boolean): void {
      if (async !== false) throw new Error('expected a synchronous read')
      this.url = url
    }
    send(): void {
      const text = blobText.get(this.url)
      if (text === undefined) throw new Error(`blob ${this.url} was already freed`)
      this.responseText = text
    }
  }
  const workers: { url: string; posted: unknown[]; listeners: ((e: unknown) => void)[] }[] = []
  class FakeWorker {
    posted: unknown[] = []
    listeners: ((e: unknown) => void)[] = []
    constructor(public url: string) {
      workers.push(this)
    }
    addEventListener(_: string, fn: (e: unknown) => void): void {
      this.listeners.push(fn)
    }
    postMessage(m: unknown): void {
      this.posted.push(m)
    }
  }
  class Element {
    attrs: Record<string, string> = {}
    setAttribute(name: string, value: string): void {
      this.attrs[name] = value
    }
  }
  class HTMLMediaElement extends Element {
    private current = ''
    paused = true
    get src(): string {
      return this.current
    }
    set src(v: string) {
      this.current = v
    }
    play(): Promise<void> {
      return Promise.resolve()
    }
  }
  const sandbox: Record<string, unknown> = {
    ...globals,
    fetch: twitch.fetch,
    Worker: FakeWorker,
    XMLHttpRequest: FakeXHR,
    addEventListener: () => undefined,
    Element,
    HTMLMediaElement,
    location: new URL('https://player.twitch.tv/?channel=somechannel'),
    ReactNativeWebView: { postMessage: (m: string) => reported.push(JSON.parse(m).__twitchAds) },
    URL: Object.assign(class extends URL {}, {
      createObjectURL: (b: Blob) => {
        const id = `blob:test/${blobs.size}`
        blobs.set(id, b)
        return id
      }
    })
  }
  sandbox.window = sandbox
  vm.runInNewContext(TWITCH_AD_SCRIPT, sandbox)
  return { sandbox, reported, blobs, blobText, workers, twitch }
}

/** A fake worker running the prelude the page script gave it. */
function worker(prelude: string) {
  const twitch = fakeTwitch()
  const posted: { __shAd?: unknown }[] = []
  const listeners: ((e: { data: unknown; stopImmediatePropagation(): void }) => void)[] = []
  const sandbox: Record<string, unknown> = {
    ...globals,
    fetch: twitch.fetch,
    postMessage: (m: { __shAd?: unknown }) => posted.push(m),
    addEventListener: (_: string, fn: (typeof listeners)[number]) => listeners.push(fn),
    importScripts: () => undefined
  }
  sandbox.self = sandbox
  vm.runInNewContext(prelude, sandbox)
  return { sandbox, posted, listeners, twitch }
}

describe('injected Twitch ad blocking', () => {
  it('starts every classic worker with the filter, then the worker’s own script', async () => {
    const { sandbox, blobs, workers } = await page()
    const W = sandbox.Worker as new (url: string, o?: { type?: string }) => unknown
    new W('https://static.twitchcdn.net/assets/worker.js')
    new W('https://static.twitchcdn.net/assets/module.js', { type: 'module' })
    expect(workers[0].url).toMatch(/^blob:test\//)
    const text = await blobs.get(workers[0].url)!.text()
    expect(text).toContain('importScripts("https://static.twitchcdn.net/assets/worker.js")')
    expect(workers[1].url).toBe('https://static.twitchcdn.net/assets/module.js')
  })

  it('reads a blob: worker script right away, since the player frees that address at once', async () => {
    const { sandbox, blobs, blobText, workers } = await page()
    blobText.set('blob:https://player.twitch.tv/abc', 'self.twitchVideoEngine = true;')
    new (sandbox.Worker as new (url: string) => unknown)('blob:https://player.twitch.tv/abc')
    blobText.delete('blob:https://player.twitch.tv/abc') // what the player does next
    const text = await blobs.get(workers[0].url)!.text()
    expect(text).toContain('self.twitchVideoEngine = true;')
    expect(text).not.toContain('importScripts("blob:')
  })

  it('filters ad breaks inside the worker and reports it', async () => {
    const { sandbox, blobs, workers } = await page()
    new (sandbox.Worker as new (url: string) => unknown)('https://static.twitchcdn.net/assets/worker.js')
    const prelude = (await blobs.get(workers[0].url)!.text()).replace(/importScripts\(.*\);\s*$/, '')
    const w = worker(prelude)
    const wFetch = w.sandbox.fetch as typeof fetch
    await (await wFetch(USHER)).text()
    await tick()
    const res = await wFetch(PLAYER_720)
    const text = await res.text()
    expect(text).toContain('b3.ts')
    expect(text).not.toContain('Amazon')
    const messages = w.posted.map((m) => m.__shAd)
    expect(messages).toContainEqual({ mode: 'worker' })
    expect(messages.some((m) => /ad-free stream \(embed\/web\)/.test(String((m as { log?: string }).log)))).toBe(true)
  })

  it('passes the player’s token headers to workers, and workers use them for backup tokens', async () => {
    const { sandbox, blobs, workers } = await page()
    new (sandbox.Worker as new (url: string) => unknown)('https://static.twitchcdn.net/assets/worker.js')
    const body = JSON.stringify({ operationName: 'PlaybackAccessToken', variables: { login: 'somechannel', isLive: true } })
    await (sandbox.fetch as typeof fetch)('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-Id': 'cid', 'Client-Integrity': 'integrity' }, body })
    const sent = workers[0].posted.at(-1) as { __shAdToken: { login: string; headers: Record<string, string> } }
    expect(sent.__shAdToken).toEqual({ login: 'somechannel', headers: { 'client-id': 'cid', 'client-integrity': 'integrity' } })

    // In the worker, that message goes to the filter (not the player's own handler)...
    const w = worker((await blobs.get(workers[0].url)!.text()).replace(/importScripts\(.*\);\s*$/, ''))
    let stopped = false
    for (const l of w.listeners) l({ data: sent, stopImmediatePropagation: () => (stopped = true) })
    expect(stopped).toBe(true)
    // ...which asks for backup tokens with the player's headers.
    await (w.sandbox.fetch as typeof fetch)(USHER)
    await tick()
    expect(w.twitch.gqlHeaders[0]).toMatchObject({ 'client-id': 'cid', 'client-integrity': 'integrity' })
  })

  it('relays the worker’s messages to the app and hides them from the player', async () => {
    const { sandbox, workers, reported } = await page()
    new (sandbox.Worker as new (url: string) => unknown)('https://static.twitchcdn.net/assets/worker.js')
    let stopped = false
    for (const l of workers[0].listeners) l({ data: { __shAd: { mode: 'worker' } }, stopImmediatePropagation: () => (stopped = true) })
    expect(stopped).toBe(true)
    expect(reported).toContainEqual({ mode: 'worker' })
  })

  it('gives the system video player the prepared ad-free stream from the start (no reload)', async () => {
    const { sandbox, reported } = await page()
    await tick() // the page asks for that stream as soon as it opens
    const media = new (sandbox.HTMLMediaElement as new () => { src: string })()
    media.src = USHER
    // Already swapped, synchronously: the player never loads its own stream first.
    expect(new URL(media.src).searchParams.get('token')).toBe('tok')
    expect(reported).toContainEqual({ mode: 'native' })
    expect(reported.some((m) => /started on the embed\/web stream/.test(String((m as { log?: string }).log)))).toBe(true)
  })

  it('switches the system video player to a token kind usually served without ads', async () => {
    const { sandbox, reported } = await page()
    const media = new (sandbox.HTMLMediaElement as new () => { src: string })()
    media.src = USHER
    await tick()
    expect(reported).toContainEqual({ mode: 'native' })
    expect(new URL(media.src).searchParams.get('token')).toBe('tok')
    expect(media.src).toMatch(/^https:\/\/usher\.ttvnw\.net\/api\/channel\/hls\/somechannel\.m3u8/)
  })
})
