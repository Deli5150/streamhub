import AsyncStorage from '@react-native-async-storage/async-storage'
import { emptyMeta, type SyncMeta } from '@shared/sync'
import type { Channel, ImportedPlaylist, LiveInfo, Platform, SavedItem, Settings } from '@shared/types'

// Mobile stand-in for the desktop's src/main/store.ts (same keys and API), kept in memory and saved
// to AsyncStorage. `loadStore()` must finish before anything reads it (the root layout and the
// background task both await it). Secrets aren't kept here: Google keeps its own sign-in.

interface Data {
  follows: Partial<Record<Platform, Channel[]>>
  muted: string[]
  usernames: Partial<Record<Platform, string>>
  followsSyncedAt: Partial<Record<Platform, number>>
  liveCache: { at: number; live: Record<string, LiveInfo> }
  settings: Partial<Settings>
  watchLater: SavedItem[]
  /** Imported YouTube playlists (see ytPlaylists.ts). */
  ytPlaylists: ImportedPlaylist[]
  /** Unused on mobile; kept so the desktop store's shape type-checks. */
  secrets: Record<string, string>
  /** Sync with Google bookkeeping (see lib/sync.ts). */
  syncMeta: SyncMeta
  /** Whether Sync with Google is on (its Google sign-in is shared with YouTube's on iPhone). */
  syncEnabled: boolean
}

type ChangeListener = <K extends keyof Data>(key: K, prev: Data[K], next: Data[K]) => void
const listeners: ChangeListener[] = []

const KEY = 'streamhub'
let data: Data | null = null
let loading: Promise<void> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

const defaults = (): Data => ({
  follows: {},
  muted: [],
  usernames: {},
  followsSyncedAt: {},
  liveCache: { at: 0, live: {} },
  settings: {},
  watchLater: [],
  ytPlaylists: [],
  secrets: {},
  syncMeta: emptyMeta(),
  syncEnabled: false
})

export function loadStore(): Promise<void> {
  loading ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      data = { ...defaults(), ...(raw ? (JSON.parse(raw) as Partial<Data>) : {}) }
    })
    .catch(() => {
      data = defaults()
    })
  return loading
}

/** Re-reads saved data (the background task may have written since this copy was loaded). */
export async function reloadStore(): Promise<void> {
  loading = null
  await loadStore()
}

function load(): Data {
  if (!data) throw new Error('store read before loadStore() finished')
  return data
}

/** Writes now instead of after the usual short delay (before the app is suspended). */
export async function flushStore(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  if (data) await AsyncStorage.setItem(KEY, JSON.stringify(data))
}

function save(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void flushStore().catch((e) => console.error('[store] save', e)), 200)
}

export const store = {
  get<K extends keyof Data>(k: K): Data[K] {
    return load()[k]
  },
  set<K extends keyof Data>(k: K, v: Data[K]): void {
    const prev = load()[k]
    load()[k] = v
    save()
    for (const fn of listeners) fn(k, prev, v)
  },
  /** Called after every set, with the key's previous and new value. */
  onChange(fn: ChangeListener): void {
    listeners.push(fn)
  },
  hasSecret(name: string): boolean {
    return Boolean(load().secrets[name])
  },
  async getSecret<T>(name: string): Promise<T | undefined> {
    const raw = load().secrets[name]
    return raw ? (JSON.parse(raw) as T) : undefined
  },
  async setSecret(name: string, value: unknown): Promise<void> {
    const d = load()
    if (value === undefined || value === null) delete d.secrets[name]
    else d.secrets[name] = JSON.stringify(value)
    save()
  }
}
