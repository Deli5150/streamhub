import AsyncStorage from '@react-native-async-storage/async-storage'
import { PLATFORMS, type Channel, type ChannelPageData, type Platform } from '@shared/types'

// Mobile version of the desktop's src/main/channelPages.ts: channel pages open instantly from a
// saved copy, which is then refreshed; a background preloader keeps followed channels' pages ready.
// The preloader is gentler than the desktop's (phones have less battery and data to spare) and only
// runs while the app is open.

const REVALIDATE_MS = 30_000
const PRELOAD_MAX_AGE_MS = 2 * 60 * 60_000
const PRELOAD_GAP_MS: Record<Platform, number> = { twitch: 4_000, youtube: 1_500, kick: 1_000, rumble: 1_000 }
/** Fewer than the desktop keeps: AsyncStorage values are best kept to a few MB. */
const MAX_ENTRIES = 250
const KEY = 'streamhub:channel-pages'

interface Entry {
  data: ChannelPageData
  at: number
}

export type LoadPage = (ch: Channel, opts: { background: boolean }) => Promise<ChannelPageData>

let cache: Map<string, Entry> | null = null
let loading: Promise<Map<string, Entry>> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
const inFlight = new Map<string, Promise<ChannelPageData>>()
const failedAt = new Map<string, number>()
const listeners = new Set<(key: string, data: ChannelPageData) => void>()

function entries(): Promise<Map<string, Entry>> {
  if (cache) return Promise.resolve(cache)
  loading ??= AsyncStorage.getItem(KEY)
    .then((raw) => new Map(Object.entries(raw ? (JSON.parse(raw) as Record<string, Entry>) : {})))
    .catch(() => new Map<string, Entry>())
    .then((m) => (cache = m))
  return loading
}

function save(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (!cache) return
    const all = [...cache].sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ENTRIES)
    cache = new Map(all)
    AsyncStorage.setItem(KEY, JSON.stringify(Object.fromEntries(all))).catch((e) => console.error('[channel pages] save', e))
  }, 3_000)
}

/** Fresh page data as it arrives (the desktop's 'channel-page' event). */
export function onChannelPage(fn: (key: string, data: ChannelPageData) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

async function remember(key: string, data: ChannelPageData): Promise<void> {
  ;(await entries()).set(key, { data, at: Date.now() })
  save()
  for (const l of listeners) l(key, data)
}

function load(ch: Channel, loadPage: LoadPage, background: boolean): Promise<ChannelPageData> {
  const pending = inFlight.get(ch.key)
  if (pending) return pending
  const run = loadPage(ch, { background })
    .then(async (data) => {
      await remember(ch.key, data)
      return data
    })
    .finally(() => inFlight.delete(ch.key))
  inFlight.set(ch.key, run)
  return run
}

export async function getChannelPage(ch: Channel, loadPage: LoadPage, opts: { fresh?: boolean } = {}): Promise<ChannelPageData> {
  const saved = (await entries()).get(ch.key)
  if (!saved || opts.fresh) return load(ch, loadPage, false)
  if (Date.now() - saved.at > REVALIDATE_MS) load(ch, loadPage, false).catch((e) => console.error(`[${ch.platform}] refresh ${ch.id}`, e))
  return saved.data
}

let preloading = false
let paused = false

/** Preloading stops while the app is in the background. */
export const setPreloadPaused = (p: boolean): void => void (paused = p)

export function startPreloading(channels: () => Channel[], connected: (p: Platform) => boolean, loadPage: LoadPage): void {
  if (preloading) return
  preloading = true
  for (const p of PLATFORMS) {
    const loop = async (): Promise<void> => {
      for (;;) {
        const next = !paused && connected(p) ? await nextToPreload(channels().filter((c) => c.platform === p)) : undefined
        if (!next) {
          await sleep(60_000)
          continue
        }
        await load(next, loadPage, true).catch((e) => {
          failedAt.set(next.key, Date.now())
          console.error(`[${p}] preload ${next.id}`, (e as Error).message)
        })
        await sleep(PRELOAD_GAP_MS[p])
      }
    }
    setTimeout(() => void loop(), 30_000)
  }
}

async function nextToPreload(chs: Channel[]): Promise<Channel | undefined> {
  const saved = await entries()
  const now = Date.now()
  let best: Channel | undefined
  let bestAt = Infinity
  for (const c of chs) {
    if (inFlight.has(c.key) || now - (failedAt.get(c.key) ?? 0) < PRELOAD_MAX_AGE_MS / 2) continue
    const at = saved.get(c.key)?.at ?? 0
    if (now - at < PRELOAD_MAX_AGE_MS || at >= bestAt) continue
    best = c
    bestAt = at
  }
  return best
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
