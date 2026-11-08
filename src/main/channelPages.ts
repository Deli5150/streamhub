import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { PLATFORMS, type Channel, type ChannelPageData, type Platform } from '@shared/types'

// Channel pages (past streams, videos, clips, Shorts) open instantly from a saved copy, which is then
// refreshed in the background; fresh results are pushed to the windows as 'channel-page'. A
// background preloader works through every followed channel so even never-opened pages are ready.

/** A saved page older than this is refreshed when opened (it's still shown immediately, and the fresh one replaces it). */
const REVALIDATE_MS = 30_000
/** The preloader keeps every followed channel's page at most this old. */
const PRELOAD_MAX_AGE_MS = 60 * 60_000
/** Pause between background loads on one platform, to stay light on the sites and the CPU. */
const PRELOAD_GAP_MS: Record<Platform, number> = { twitch: 1_500, youtube: 400, kick: 300, rumble: 300 }
/** Channels kept on disk (most recently loaded). */
const MAX_ENTRIES = 600

interface Entry {
  data: ChannelPageData
  at: number
}

export type LoadPage = (ch: Channel, opts: { background: boolean }) => Promise<ChannelPageData>

const file = (): string => path.join(app.getPath('userData'), 'channel-pages.json')
let cache: Map<string, Entry> | null = null
let saveTimer: NodeJS.Timeout | null = null
const inFlight = new Map<string, Promise<ChannelPageData>>()
/** Channels whose last background load failed, and when. */
const failedAt = new Map<string, number>()

function entries(): Map<string, Entry> {
  if (cache) return cache
  try {
    cache = new Map(Object.entries(JSON.parse(fs.readFileSync(file(), 'utf8')) as Record<string, Entry>))
  } catch {
    cache = new Map()
  }
  return cache
}

function save(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const all = [...entries()].sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ENTRIES)
    cache = new Map(all)
    fs.promises.writeFile(file(), JSON.stringify(Object.fromEntries(all))).catch((e) => console.error('[channel pages] save', e))
  }, 3_000)
}

function store(key: string, data: ChannelPageData): void {
  entries().set(key, { data, at: Date.now() })
  save()
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('channel-page', key, data)
}

/** Loads a page from the site (one load per channel at a time) and saves it. */
function load(ch: Channel, loadPage: LoadPage, background: boolean): Promise<ChannelPageData> {
  const pending = inFlight.get(ch.key)
  if (pending) return pending
  const started = Date.now()
  const run = loadPage(ch, { background })
    .then((data) => {
      store(ch.key, data)
      if (!background) console.log(`[${ch.platform}] channel page ${ch.id} in ${((Date.now() - started) / 1000).toFixed(1)}s`)
      return data
    })
    .finally(() => inFlight.delete(ch.key))
  inFlight.set(ch.key, run)
  return run
}

/**
 * A channel's page: the saved copy straight away (refreshed in the background when it's a few minutes
 * old), or a fresh load if there's none. `fresh` always waits for the site.
 */
export function getChannelPage(ch: Channel, loadPage: LoadPage, opts: { fresh?: boolean } = {}): Promise<ChannelPageData> {
  const saved = entries().get(ch.key)
  if (!saved || opts.fresh) return load(ch, loadPage, false)
  if (Date.now() - saved.at > REVALIDATE_MS) load(ch, loadPage, false).catch((e) => console.error(`[${ch.platform}] refresh ${ch.id}`, e))
  return Promise.resolve(saved.data)
}

let preloading = false

/**
 * Keeps every followed channel's page saved and recent: one platform-paced background loop each,
 * never-loaded channels first, then the oldest. `channels` is re-read every round, so follows
 * changes are picked up.
 */
export function startPreloading(channels: () => Channel[], connected: (p: Platform) => boolean, loadPage: LoadPage): void {
  if (preloading) return
  preloading = true
  for (const p of PLATFORMS) {
    const loop = async (): Promise<void> => {
      for (;;) {
        const next = connected(p) ? nextToPreload(channels().filter((c) => c.platform === p)) : undefined
        if (!next) {
          await sleep(60_000)
          continue
        }
        await load(next, loadPage, true).catch((e) => {
          // So one broken channel doesn't hold up the queue; it's retried later.
          failedAt.set(next.key, Date.now())
          console.error(`[${p}] preload ${next.id}`, (e as Error).message)
        })
        await sleep(PRELOAD_GAP_MS[p])
      }
    }
    // Start after the launch rush (follows and live status) has settled.
    setTimeout(() => void loop(), 20_000)
  }
}

function nextToPreload(chs: Channel[]): Channel | undefined {
  const now = Date.now()
  let best: Channel | undefined
  let bestAt = Infinity
  for (const c of chs) {
    if (inFlight.has(c.key) || now - (failedAt.get(c.key) ?? 0) < PRELOAD_MAX_AGE_MS / 2) continue
    const at = entries().get(c.key)?.at ?? 0
    if (now - at < PRELOAD_MAX_AGE_MS || at >= bestAt) continue
    best = c
    bestAt = at
  }
  return best
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
