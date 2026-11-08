import * as Notifications from 'expo-notifications'
import { create } from 'zustand'
import { PLATFORMS, type AppState, type Channel, type ChannelAbout, type ChannelPageData, type LiveInfo, type MediaCategory, type MediaItem, type Platform, type SavedItem, type TogetherChannel } from '@shared/types'
import { kick } from '../../../src/main/providers/kick'
import { rumble } from '../../../src/main/providers/rumble'
import { twitch } from '../../../src/main/providers/twitch'
import type { Provider } from '../../../src/main/providers/types'
import { getSaved, savedOps, syncSaved } from '../../../src/main/watchLater'
import { getPlaylists, importPlaylists, listPlaylists, PLAYLIST_REFRESH_MS, refreshPlaylists, removePlaylist } from '../../../src/main/ytPlaylists'
import { AuthError } from '../desktop/net'
import { flushStore, store } from '../desktop/store'
import { getChannelPage as cachedChannelPage, setPreloadPaused, startPreloading, type LoadPage } from './channelPages'
import { readerAvailable } from './reader'
import { getSettings, updateSettings, type SettingsPatch } from './settings'
import { startSync, syncOnForeground, syncStatus } from './sync'
import { autoCheck, startUpdater, updateStatus } from './updater'
import { twitchLiveFromApi } from './twitchLive'
import { youtubeProvider } from './youtubeWeb'

// Mobile version of the desktop's src/main/hub.ts: follows sync, live polling, go-live alerts and the
// actions the screens call. The providers are the desktop's own. State is published to the screens
// through the useApp store instead of IPC.

const providers: Record<Platform, Provider> = { twitch, youtube: youtubeProvider, kick, rumble }
const FOLLOWS_REFRESH_MS = 30 * 60_000
const LIVE_CACHE_MAX_AGE_MS = 15 * 60_000

let live: Record<string, LiveInfo> = {}
const errors: Partial<Record<Platform, string>> = {}
const syncing = new Set<Platform>()
const lastPoll: Partial<Record<Platform, number>> = {}
const polling = new Map<Platform, Promise<void>>()
const notifyReady = new Set<Platform>()
const ABOUT_CACHE_MS = 10 * 60_000
const aboutCache = new Map<string, { at: number; result: Promise<ChannelAbout> }>()
const TOGETHER_CACHE_MS = 2 * 60_000
const togetherCache = new Map<string, { at: number; result: Promise<TogetherChannel[]> }>()

/** App state for the screens (the desktop renderer's `app`). Null until show() runs. */
export const useApp = create<{ app: AppState | null }>(() => ({ app: null }))

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
    shortcutDefaults: { toggleSidebar: [], toggleChannels: [], multiView: [], pip: [], returnHome: [], toggleMenubarApp: [] },
    watchLater: getSaved(),
    ytPlaylists: getPlaylists(),
    sync: syncStatus(),
    update: updateStatus(),
    phoneSignIn: null,
    accounts: PLATFORMS.map((p) => ({
      platform: p,
      connected: providers[p].isConnected(),
      username: providers[p].username(),
      error: errors[p]
    }))
  }
}

export const emit = (): void => useApp.setState({ app: state() })

async function guarded(p: Platform, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    delete errors[p]
  } catch (e) {
    errors[p] = e instanceof AuthError ? 'Session expired — reconnect this account' : (e as Error).message
    console.error(`[${p}]`, e)
  }
}

function notifyLive(l: LiveInfo): void {
  if (!getSettings().notifyLive || store.get('muted').includes(l.key)) return
  const ch = channels().find((c) => c.key === l.key)
  if (!ch) return
  void Notifications.scheduleNotificationAsync({
    content: { title: `${ch.displayName} is live`, body: l.title || 'Started streaming', data: { channelKey: l.key }, sound: true },
    trigger: null
  }).catch((e) => console.error('[notify]', e))
}

/** Live status for one platform. The background task has no page reader, so Twitch asks its API then. */
async function fetchLive(p: Platform, chs: Channel[]): Promise<LiveInfo[]> {
  if (!chs.length) return []
  if (p === 'twitch' && !readerAvailable()) {
    const fromApi = await twitchLiveFromApi()
    if (!fromApi) throw new Error('twitch: live status needs the app open')
    return fromApi
  }
  return providers[p].getLive(chs)
}

export function pollLive(p: Platform, force = false): Promise<void> {
  const inFlight = polling.get(p)
  if (inFlight) return inFlight
  if (!force && Date.now() - (lastPoll[p] ?? 0) < providers[p].liveIntervalMs) return Promise.resolve()
  const run = doPollLive(p).finally(() => polling.delete(p))
  polling.set(p, run)
  return run
}

async function doPollLive(p: Platform): Promise<void> {
  lastPoll[p] = Date.now()
  const started = Date.now()
  const chs = channels().filter((c) => c.platform === p)
  await guarded(p, async () => {
    const result = await fetchLive(p, chs)
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
  })
  emit()
}

const SIGNED_OUT_LIVE_MS = 2 * 60_000
let signedOutAt = 0
let signedOutRun: Promise<void> | null = null

/**
 * Live status for combined channels' members on platforms this phone isn't signed in to (their
 * follows can arrive by sync without the sign-in), from public pages, so the stream and chat
 * switchers still find them live. As the desktop's hub.ts.
 */
function pollSignedOutMembers(force = false): Promise<void> {
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
  await guarded(p, async () => {
    const follows = await providers[p].getFollows()
    store.set('follows', { ...store.get('follows'), [p]: follows })
    store.set('followsSyncedAt', { ...store.get('followsSyncedAt'), [p]: Date.now() })
  })
  syncing.delete(p)
  await pollLive(p, true)
}

const followsStale = (p: Platform): boolean =>
  !store.get('follows')[p]?.length || Date.now() - (store.get('followsSyncedAt')[p] ?? 0) > FOLLOWS_REFRESH_MS

const loadPage: LoadPage = (ch, opts) => providers[ch.platform].getChannelPage(ch, opts)

/** Last known live status (if recent), so lists aren't empty while fresh status loads. */
function restoreLiveCache(): void {
  const cached = store.get('liveCache')
  if (Date.now() - cached.at < LIVE_CACHE_MAX_AGE_MS) {
    const known = new Set(channels().map((c) => c.key))
    live = Object.fromEntries(Object.entries(cached.live).filter(([k]) => known.has(k)))
  }
}

let timer: ReturnType<typeof setInterval> | null = null

let shown = false

/** Publishes the saved state (follows, last known live status) for the screens; no network yet. */
export function show(): void {
  if (shown) return
  shown = true
  restoreLiveCache()
  emit()
}

/**
 * Starts syncing and polling (the store must be loaded). Call once the screens, and with them the
 * page reader, are mounted: Twitch's live status is read in it. Safe to call again.
 */
export function start(): void {
  if (timer) return void emit()
  show()
  startPreloading(channels, (p) => providers[p].isConnected(), loadPage)
  for (const p of PLATFORMS) {
    if (!providers[p].isConnected()) continue
    pollLive(p, true)
    if (followsStale(p)) syncFollows(p)
  }
  void pollSignedOutMembers(true)
  // Imported YouTube playlists catch up with changes made on YouTube.
  void refreshPlaylists(providers.youtube, undefined, PLAYLIST_REFRESH_MS).then(emit, () => {})
  timer = setInterval(tick, 15_000)
  startSync(emit, (p) => void syncFollows(p))
  startUpdater(emit)
}

function tick(): void {
  for (const p of PLATFORMS) {
    if (!providers[p].isConnected()) continue
    if (followsStale(p)) syncFollows(p)
    else pollLive(p)
  }
  void pollSignedOutMembers()
}

/** The app moved to the foreground or background. */
export function setForeground(foreground: boolean): void {
  setPreloadPaused(!foreground)
  if (foreground) {
    tick()
    syncOnForeground()
    autoCheck()
  } else void flushStore()
}

/**
 * One live check for the background task (no screens, no page reader): alerts for channels that went
 * live since the last check the app saw.
 */
export async function backgroundCheck(): Promise<void> {
  restoreLiveCache()
  // Channels already live in the last saved status don't alert again.
  for (const p of PLATFORMS) if (store.get('liveCache').at) notifyReady.add(p)
  await Promise.all(PLATFORMS.filter((p) => providers[p].isConnected()).map((p) => pollLive(p, true)))
  await flushStore()
}

const findChannel = (key: string): Channel | undefined => channels().find((c) => c.key === key)

export const actions = {
  async login(p: Platform) {
    await providers[p].login()
    delete errors[p]
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
    live = { ...live }
    emit()
  },

  async refresh() {
    await Promise.all(PLATFORMS.map((p) => syncFollows(p)))
  },

  async getChannelPage(key: string, opts: { fresh?: boolean } = {}): Promise<ChannelPageData> {
    const ch = findChannel(key)
    if (!ch) throw new Error('Channel not found')
    return cachedChannelPage(ch, loadPage, opts)
  },

  async loadMore(key: string, category: MediaCategory, cursor: string): Promise<{ items: MediaItem[]; cursor: string | null }> {
    const ch = findChannel(key)
    return ch ? providers[ch.platform].loadMore(ch, category, cursor) : { items: [], cursor: null }
  },

  async getAbout(key: string): Promise<ChannelAbout> {
    const ch = findChannel(key)
    if (!ch) throw new Error('Channel not found')
    const l = live[key]
    const cacheKey = `${key}|${l?.streamId ?? ''}|${l?.pageUrl ?? ''}`
    const hit = aboutCache.get(cacheKey)
    if (hit && Date.now() - hit.at < ABOUT_CACHE_MS) return hit.result
    const result = providers[ch.platform].getAbout(ch, l)
    aboutCache.set(cacheKey, { at: Date.now(), result })
    result.catch(() => aboutCache.delete(cacheKey))
    return result
  },

  async getTogether(key: string): Promise<TogetherChannel[]> {
    const ch = findChannel(key)
    const get = ch && providers[ch.platform].getTogether
    if (!ch || !get) return []
    const l = live[key]
    const cacheKey = `${key}|${l?.title ?? ''}`
    const hit = togetherCache.get(cacheKey)
    if (hit && Date.now() - hit.at < TOGETHER_CACHE_MS) return hit.result
    const result = get(ch, l)
    togetherCache.set(cacheKey, { at: Date.now(), result })
    result.catch(() => togetherCache.delete(cacheKey))
    return result
  },

  updateSettings(patch: SettingsPatch) {
    updateSettings(patch)
    emit()
  },

  saved: {
    toggle: (item: Omit<SavedItem, 'savedAt'>) => (savedOps.toggle(item), emit()),
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

  toggleMute(key: string) {
    const muted = store.get('muted')
    store.set('muted', muted.includes(key) ? muted.filter((k) => k !== key) : [...muted, key])
    emit()
  }
}
