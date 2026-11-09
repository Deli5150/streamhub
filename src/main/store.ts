import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { emptyMeta, type SyncMeta } from '@shared/sync'
import type { Channel, ImportedPlaylist, LiveInfo, Platform, SavedItem, Settings } from '@shared/types'

interface Data {
  follows: Partial<Record<Platform, Channel[]>>
  muted: string[]
  usernames: Partial<Record<Platform, string>>
  /** When each platform's follows were last synced (survives restarts). */
  followsSyncedAt: Partial<Record<Platform, number>>
  /** Last known live status, shown immediately on launch while fresh status loads. */
  liveCache: { at: number; live: Record<string, LiveInfo> }
  /** User settings (see main/settings.ts for defaults). */
  settings: Partial<Settings>
  /** Watch Later playlist (see main/watchLater.ts). */
  watchLater: SavedItem[]
  /** Imported YouTube playlists (see ytPlaylists.ts). */
  ytPlaylists: ImportedPlaylist[]
  /** base64 of safeStorage-encrypted JSON values */
  secrets: Record<string, string>
  /** Sync with Google bookkeeping (see sync.ts). */
  syncMeta: SyncMeta
}

type ChangeListener = <K extends keyof Data>(key: K, prev: Data[K], next: Data[K]) => void
const listeners: ChangeListener[] = []
/** Decrypted secrets, by their encrypted value (a new value is decrypted afresh). */
const decrypted = new Map<string, Promise<unknown>>()

const file = (): string => path.join(app.getPath('userData'), 'streamhub.json')
let data: Data | null = null
let saveTimer: NodeJS.Timeout | null = null

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
  syncMeta: emptyMeta()
})

function load(): Data {
  if (data) return data
  try {
    data = { ...defaults(), ...(JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<Data>) }
  } catch {
    data = defaults()
  }
  return data
}

function save(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify(data, null, 2))
  }, 200)
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
  /** Whether a secret is saved, without decrypting it (so without touching the OS keychain). */
  hasSecret(name: string): boolean {
    return Boolean(load().secrets[name])
  },
  /**
   * Decrypts a saved secret. Asynchronous on purpose: on macOS this reads the keychain, which can
   * show a password prompt (e.g. after an update changes the app's signature), and the synchronous
   * API froze the whole app until it was answered.
   */
  getSecret<T>(name: string): Promise<T | undefined> {
    const raw = load().secrets[name]
    if (!raw) return Promise.resolve(undefined)
    // Each saved value is decrypted once per run and kept in memory: the first keychain read can
    // take seconds, and the sign-ins are needed again every hour.
    let cached = decrypted.get(raw)
    if (!cached) {
      cached = (async () => {
        try {
          const text = (await safeStorage.isAsyncEncryptionAvailable())
            ? (await safeStorage.decryptStringAsync(Buffer.from(raw, 'base64'))).result
            : Buffer.from(raw, 'base64').toString('utf8')
          return JSON.parse(text) as unknown
        } catch {
          decrypted.delete(raw)
          return undefined
        }
      })()
      decrypted.set(raw, cached)
    }
    return cached as Promise<T | undefined>
  },
  /** Starts decrypting every saved secret now (at launch), so the keychain read is out of the way by the time one is needed. */
  warmSecrets(): void {
    for (const name of Object.keys(load().secrets)) void this.getSecret(name)
  },
  async setSecret(name: string, value: unknown): Promise<void> {
    const d = load()
    if (value === undefined || value === null) delete d.secrets[name]
    else {
      const text = JSON.stringify(value)
      d.secrets[name] = (await safeStorage.isAsyncEncryptionAvailable())
        ? (await safeStorage.encryptStringAsync(text)).toString('base64')
        : Buffer.from(text).toString('base64')
    }
    save()
  }
}
