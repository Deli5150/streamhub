import { BrowserWindow, Notification, shell } from 'electron'
import { PLATFORMS, type AppState, type Channel, type ChannelAbout, type ChannelPageData, type TogetherChannel, type LiveInfo, type MediaCategory, type MediaItem, type PhoneSignIn, type Platform } from '@shared/types'
import { channelPageUrl } from '@shared/urls'
import { setTrayLiveCount } from './menubar'
import { getSettings, SHORTCUT_DEFAULTS } from './settings'
import { AuthError } from './net'
import { recoverSession } from './sessionKeeper'
import { store } from './store'
import { startSync, syncStatus } from './sync'
import { updateStatus } from './updater'
import { getChannelPage as cachedChannelPage, startPreloading, type LoadPage } from './channelPages'
import { getSaved, savedOps, syncSaved } from './watchLater'
import { getPlaylists, importPlaylists, listPlaylists, PLAYLIST_REFRESH_MS, refreshPlaylists, removePlaylist } from './ytPlaylists'
import { kick } from './providers/kick'
import { rumble } from './providers/rumble'
import { twitch } from './providers/twitch'
import type { Provider } from './providers/types'
import { youtube } from './providers/youtube'

const providers: Record<Platform, Provider> = { twitch, youtube, kick, rumble }
const FOLLOWS_REFRESH_MS = 30 * 60_000
/** Cached live status younger than this is shown at launch while fresh status loads. */
const LIVE_CACHE_MAX_AGE_MS = 15 * 60_000

let live: Record<string, LiveInfo> = {}
const errors: Partial<Record<Platform, string>> = {}
const syncing = new Set<Platform>()
const lastPoll: Partial<Record<Platform, number>> = {}
/** Platforms whose last live check was a quick follow-up (see liveIsPartial), so it isn't repeated. */
const quickRetry = new Set<Platform>()
const QUICK_RETRY_MS = 8_000
const polling = new Map<Platform, Promise<void>>()
/** Platforms that finished a first live poll — earlier polls must not fire "went live" alerts. */
const notifyReady = new Set<Platform>()
let win: BrowserWindow | null = null
/** A Google sign-in waiting to be approved on a phone (Big Picture shows its code). */
let phoneSignIn: PhoneSignIn | null = null
export function setPhoneSignIn(next: PhoneSignIn | null): void {
  phoneSignIn = next
  emit()
}
/** About sections / stream descriptions rarely change mid-stream; reopening a stream reuses them. */
const ABOUT_CACHE_MS = 10 * 60_000
const aboutCache = new Map<string, { at: number; result: Promise<ChannelAbout> }>()
const TOGETHER_CACHE_MS = 2 * 60_000
const togetherCache = new Map<string, { at: number; result: Promise<TogetherChannel[]> }>()

function channels(): Channel[] {
  const byKey = new Map<string, Channel>()
  for (const p of PLATFORMS) for (const c of store.get('follows')[p] ?? []) byKey.set(c.key, c)
  return [...byKey.values()]
}

export function state(): AppState {
  return {
    channels: channels(),
    live,
    muted: store.get('muted'),
    syncing: [...syncing],
    settings: getSettings(),
    shortcutDefaults: SHORTCUT_DEFAULTS,
    watchLater: getSaved(),
    ytPlaylists: getPlaylists(),
    sync: syncStatus(),
    update: updateStatus(),
    phoneSignIn,
    accounts: PLATFORMS.map((p) => ({
      platform: p,
      connected: providers[p].isConnected(),
      username: providers[p].username(),
      error: errors[p]
    }))
  }
}

/** Sends fresh state to every app window (main window + menu-bar popup). */
export const emit = (): void => {
  const s = state()
  setTrayLiveCount(Object.keys(s.live).length)
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('state', s)
}

export const showMainWindow = (): void => {
  if (!win || win.isDestroyed()) return
  win.show()
  win.focus()
}

/**
 * Runs `fn`, keeping the platform's error for the UI. True when it worked. A signed-out answer first
 * gets one recovery attempt (see sessionKeeper.ts) and a second try before it counts as expired.
 */
async function guarded(p: Platform, fn: () => Promise<void>, retried = false): Promise<boolean> {
  try {
    await fn()
    delete errors[p]
    return true
  } catch (e) {
    if (e instanceof AuthError && !retried && providers[p].isConnected() && (await recoverSession(p))) return guarded(p, fn, true)
    errors[p] = e instanceof AuthError ? 'Session expired — reconnect this account' : (e as Error).message
    console.error(`[${p}]`, e)
    return false
  }
}

function notifyLive(l: LiveInfo): void {
  if (!getSettings().notifyLive || store.get('muted').includes(l.key) || !Notification.isSupported()) return
  const ch = channels().find((c) => c.key === l.key)
  if (!ch) return
  const n = new Notification({ title: `${ch.displayName} is live`, body: l.title || 'Started streaming', silent: false })
  n.on('click', () => {
    if (!win) return
    win.show()
    win.focus()
    win.webContents.send('open-channel', l.key)
  })
  n.show()
}

export function pollLive(p: Platform, force = false): Promise<void> {
  // Never run two polls for the same platform at once; callers share the in-flight one.
  const inFlight = polling.get(p)
  if (inFlight) return inFlight
  if (!force && Date.now() - (lastPoll[p] ?? 0) < providers[p].liveIntervalMs) return Promise.resolve()
  const run = doPollLive(p).finally(() => polling.delete(p))
  polling.set(p, run)
  return run
}

async function doPollLive(p: Platform): Promise<void> {
  const prov = providers[p]
  lastPoll[p] = Date.now()
  const started = Date.now()
  const chs = channels().filter((c) => c.platform === p)
  await guarded(p, async () => {
    const result = chs.length ? await prov.getLive(chs) : []
    const known = new Set(chs.map((c) => c.key))
    const next: Record<string, LiveInfo> = {}
    for (const [k, v] of Object.entries(live)) if (!k.startsWith(`${p}:`)) next[k] = v
    for (const l of result) {
      if (!known.has(l.key)) continue
      if (notifyReady.has(p) && !live[l.key]) notifyLive(l)
      next[l.key] = l
    }
    live = next
    notifyReady.add(p)
    store.set('liveCache', { at: Date.now(), live })
    syncSaved(p, live, (key) => actions.getChannelPage(key, { fresh: true }), emit)
    console.log(`[${p}] live status in ${((Date.now() - started) / 1000).toFixed(1)}s`)
    // Some details came back missing (YouTube's viewers, while its sign-in was still loading): ask
    // again soon, once.
    if (prov.liveIsPartial?.() && !quickRetry.has(p)) {
      quickRetry.add(p)
      setTimeout(() => void pollLive(p, true), QUICK_RETRY_MS)
    } else quickRetry.delete(p)
  })
  emit()
}

const SIGNED_OUT_LIVE_MS = 2 * 60_000
let signedOutAt = 0
let signedOutRun: Promise<void> | null = null

/**
 * Live status for combined channels' members on platforms this computer isn't signed in to (their
 * follows can arrive by sync without the sign-in), from public pages: without it a combined
 * channel only ever has one live member here, and its stream and chat switchers never appear.
 */
export function pollSignedOutMembers(force = false): Promise<void> {
  if (signedOutRun) return signedOutRun
  if (!force && Date.now() - signedOutAt < SIGNED_OUT_LIVE_MS) return Promise.resolve()
  signedOutAt = Date.now()
  const grouped = new Set(getSettings().combined.flatMap((g) => g.memberKeys))
  signedOutRun = (async () => {
    for (const p of PLATFORMS) {
      const get = providers[p].getLiveSignedOut
      if (!get || providers[p].isConnected()) continue
      const chs = channels().filter((c) => c.platform === p && grouped.has(c.key))
      const had = Object.keys(live).some((k) => k.startsWith(`${p}:`))
      if (!chs.length && !had) continue
      try {
        const result = chs.length ? await get(chs) : []
        const known = new Set(chs.map((c) => c.key))
        const next: Record<string, LiveInfo> = {}
        for (const [k, v] of Object.entries(live)) if (!k.startsWith(`${p}:`)) next[k] = v
        for (const l of result) if (known.has(l.key)) next[l.key] = l
        live = next
        emit()
      } catch (e) {
        console.error(`[${p}] live status signed out:`, (e as Error).message)
      }
    }
  })().finally(() => {
    signedOutRun = null
  })
  return signedOutRun
}

export async function syncFollows(p: Platform): Promise<void> {
  if (!providers[p].isConnected() || syncing.has(p)) return
  syncing.add(p)
  emit()
  const started = Date.now()
  const ok = await guarded(p, async () => {
    const follows = await providers[p].getFollows()
    store.set('follows', { ...store.get('follows'), [p]: follows })
    store.set('followsSyncedAt', { ...store.get('followsSyncedAt'), [p]: Date.now() })
    console.log(`[${p}] synced ${follows.length} follows in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  })
  if (ok) delete syncFailures[p]
  else syncFailures[p] = { count: (syncFailures[p]?.count ?? 0) + 1, at: Date.now() }
  syncing.delete(p)
  await pollLive(p, true)
}

let timer: NodeJS.Timeout | null = null

/**
 * Follows reads that failed in a row. A platform whose follows page won't load waits longer each
 * time before trying again, instead of re-syncing (and reopening its page) every 15 seconds.
 */
const syncFailures: Partial<Record<Platform, { count: number; at: number }>> = {}
const RETRY_AFTER_MS = [60_000, 2 * 60_000, 5 * 60_000, 15 * 60_000, FOLLOWS_REFRESH_MS]

const followsStale = (p: Platform): boolean => {
  const failed = syncFailures[p]
  if (failed && Date.now() - failed.at < RETRY_AFTER_MS[Math.min(failed.count, RETRY_AFTER_MS.length) - 1]) return false
  return Date.now() - (store.get('followsSyncedAt')[p] ?? 0) > FOLLOWS_REFRESH_MS
}

const loadPage: LoadPage = (ch, opts) => providers[ch.platform].getChannelPage(ch, opts)

export function start(window: BrowserWindow): void {
  win = window
  if (timer) return void emit()
  startPreloading(channels, (p) => providers[p].isConnected(), loadPage)
  // Show the last known live status straight away; fresh status replaces it within seconds.
  const cached = store.get('liveCache')
  if (Date.now() - cached.at < LIVE_CACHE_MAX_AGE_MS) {
    const known = new Set(channels().map((c) => c.key))
    live = Object.fromEntries(Object.entries(cached.live).filter(([k]) => known.has(k)))
  }
  // Live status first (fast) from the cached follow list; re-read follows only when they're stale.
  // Platforms run in parallel, and live checks use their own reader window, so neither waits.
  for (const p of PLATFORMS) {
    if (!providers[p].isConnected()) continue
    pollLive(p, true)
    if (followsStale(p)) syncFollows(p)
  }
  void pollSignedOutMembers(true)
  // Imported YouTube playlists catch up with changes made on YouTube.
  void refreshPlaylists(providers.youtube, undefined, PLAYLIST_REFRESH_MS).then(emit, () => {})
  startSync(emit, (p) => void syncFollows(p))
  timer = setInterval(() => {
    for (const p of PLATFORMS) {
      if (!providers[p].isConnected()) continue
      if (followsStale(p)) syncFollows(p)
      else pollLive(p)
    }
    void pollSignedOutMembers()
  }, 15_000)
}

export const actions = {
  async login(p: Platform) {
    await providers[p].login()
    delete errors[p]
    delete syncFailures[p]
    notifyReady.delete(p)
    await syncFollows(p)
  },

  async logout(p: Platform) {
    await providers[p].logout()
    store.set('follows', { ...store.get('follows'), [p]: [] })
    const { [p]: _, ...synced } = store.get('followsSyncedAt')
    store.set('followsSyncedAt', synced)
    delete errors[p]
    for (const k of Object.keys(live)) if (k.startsWith(`${p}:`)) delete live[k]
    emit()
  },

  async refresh() {
    await Promise.all(PLATFORMS.map((p) => syncFollows(p)))
  },

  /** Saved copy straight away when there is one (see channelPages.ts); `fresh` waits for the site. */
  async getChannelPage(key: string, opts: { fresh?: boolean } = {}): Promise<ChannelPageData> {
    const ch = channels().find((c) => c.key === key)
    if (!ch) throw new Error('Channel not found')
    return cachedChannelPage(ch, loadPage, opts)
  },

  async loadMore(key: string, category: MediaCategory, cursor: string): Promise<{ items: MediaItem[]; cursor: string | null }> {
    const ch = channels().find((c) => c.key === key)
    return ch ? providers[ch.platform].loadMore(ch, category, cursor) : { items: [], cursor: null }
  },

  async getAbout(key: string): Promise<ChannelAbout> {
    const ch = channels().find((c) => c.key === key)
    if (!ch) throw new Error('Channel not found')
    const l = live[key]
    // Keyed by stream too: YouTube and Rumble show the current stream's description.
    const cacheKey = `${key}|${l?.streamId ?? ''}|${l?.pageUrl ?? ''}`
    const hit = aboutCache.get(cacheKey)
    if (hit && Date.now() - hit.at < ABOUT_CACHE_MS) return hit.result
    const result = providers[ch.platform].getAbout(ch, l)
    aboutCache.set(cacheKey, { at: Date.now(), result })
    result.catch(() => aboutCache.delete(cacheKey))
    return result
  },

  async getTogether(key: string): Promise<TogetherChannel[]> {
    const ch = channels().find((c) => c.key === key)
    const get = ch && providers[ch.platform].getTogether
    if (!ch || !get) return []
    // Keyed by title too: a new title can @mention someone else. Shared sessions change slowly.
    const l = live[key]
    const cacheKey = `${key}|${l?.title ?? ''}`
    const hit = togetherCache.get(cacheKey)
    if (hit && Date.now() - hit.at < TOGETHER_CACHE_MS) return hit.result
    const result = get(ch, l)
    togetherCache.set(cacheKey, { at: Date.now(), result })
    result.catch(() => togetherCache.delete(cacheKey))
    return result
  },

  /** Menu-bar popup pick: open in StreamHub, or on the platform's site when that setting is on. */
  async pickFromMenubar(key: string) {
    const ch = channels().find((c) => c.key === key)
    if (!ch) return
    if (getSettings().menubar.openInBrowser) return void shell.openExternal(channelPageUrl(ch))
    showMainWindow()
    win?.webContents.send('open-channel', key)
  },

  saved: {
    toggle: (item: Parameters<typeof savedOps.toggle>[0]) => (savedOps.toggle(item), emit()),
    remove: (id: string) => (savedOps.remove(id), emit()),
    reorder: (sourceId: string, targetId: string) => (savedOps.reorder(sourceId, targetId), emit())
  },

  playlists: {
    list: () => listPlaylists(providers.youtube),
    async import(ids: string[]) {
      const all = await listPlaylists(providers.youtube)
      await importPlaylists(providers.youtube, all.filter((p) => ids.includes(p.id)))
      emit()
    },
    async refresh(id?: string) {
      await refreshPlaylists(providers.youtube, id)
      emit()
    },
    remove: (id: string) => (removePlaylist(id), emit())
  },

  async toggleMute(key: string) {
    const muted = store.get('muted')
    store.set('muted', muted.includes(key) ? muted.filter((k) => k !== key) : [...muted, key])
    emit()
  }
}
