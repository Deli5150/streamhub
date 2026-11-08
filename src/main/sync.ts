import type { Cookie } from 'electron'
import { cookieMatches, noteStoreChange, syncOnce, type SyncCookie, type SyncDevice, type SyncedData } from '@shared/sync'
import { driveFile } from '@shared/syncDrive'
import type { Platform, SyncStatus } from '@shared/types'
import { googleAccount } from './googleAuth'
import { sessionFor } from './net'
import { getSettings, updateSettings } from './settings'
import { store } from './store'

// Sync with Google (see shared/sync.ts for the format and merge): this computer's side. The file
// lives in the signed-in Google account's Drive app folder, which only StreamHub can see. Syncing
// runs at launch, every few minutes, when the window comes back, and shortly after any change.

const account = googleAccount({ scope: 'https://www.googleapis.com/auth/drive.appdata', secretKey: 'google-sync', label: 'Sync', errorPrefix: 'sync' })
const EMAIL_SECRET = 'sync-email'
const PERIOD_MS = 5 * 60_000
const AFTER_CHANGE_MS = 5_000

const drive = driveFile(account.fetch)
let running: Promise<void> | null = null
let again = false
let applying = false
let error: string | undefined
let email: string | undefined
let changeTimer: NodeJS.Timeout | null = null
let onUpdate: () => void = () => {}
let resync: (p: Platform) => void = () => {}

export function syncStatus(): SyncStatus {
  return { signedIn: account.signedIn(), email, lastSync: store.get('syncMeta').lastSync || undefined, syncing: Boolean(running), error }
}

// ---------- This device's data ----------

const syncedData = (): SyncedData => ({ settings: getSettings(), muted: store.get('muted'), follows: store.get('follows') })

function toSyncCookie(c: Cookie): SyncCookie {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain ?? '',
    path: c.path ?? '/',
    secure: Boolean(c.secure),
    httpOnly: Boolean(c.httpOnly),
    hostOnly: Boolean(c.hostOnly),
    expirationDate: c.session ? undefined : c.expirationDate,
    sameSite: c.sameSite
  }
}

async function platformCookies(p: Platform): Promise<SyncCookie[]> {
  return (await sessionFor(p).cookies.get({})).filter((c) => cookieMatches(p, c.domain ?? '')).map(toSyncCookie)
}

async function setCookies(p: Platform, cookies: SyncCookie[]): Promise<void> {
  const jar = sessionFor(p).cookies
  for (const c of cookies) {
    const host = c.domain.replace(/^\./, '')
    await jar
      .set({
        url: `https://${host}${c.path || '/'}`,
        name: c.name,
        value: c.value,
        // Host-only cookies (and __Host- ones) must be set without a domain.
        ...(c.hostOnly ? {} : { domain: c.domain }),
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        expirationDate: c.expirationDate,
        sameSite: c.sameSite
      })
      .catch((e) => console.warn(`[sync] cookie ${c.name} for ${p}:`, (e as Error).message))
  }
  await jar.flushStore().catch(() => undefined)
}

async function clearCookies(p: Platform): Promise<void> {
  const jar = sessionFor(p).cookies
  for (const c of await jar.get({})) {
    if (!cookieMatches(p, c.domain ?? '')) continue
    await jar.remove(`https://${(c.domain ?? '').replace(/^\./, '')}${c.path ?? '/'}`, c.name).catch(() => undefined)
  }
}

/** YouTube's connection on this computer is its Google sign-in, so a synced login only brings chat's cookies. */
const usesUsername = (p: Platform): boolean => p !== 'youtube'

/** This computer, for the shared sync (shared/sync.ts). Changes it applies aren't counted as local ones. */
const device: SyncDevice = {
  download: drive.download,
  upload: drive.upload,
  data: syncedData,
  watchLater: () => store.get('watchLater'),
  meta: () => store.get('syncMeta'),
  saveMeta: (meta) => store.set('syncMeta', meta),
  applyFields(patch) {
    quietly(() => {
      if (patch.settings) updateSettings(patch.settings)
      if (patch.muted) store.set('muted', patch.muted)
      if (patch.follows) store.set('follows', { ...store.get('follows'), ...patch.follows })
    })
  },
  setWatchLater: (items) => quietly(() => store.set('watchLater', items)),
  usernames: () => store.get('usernames'),
  cookies: platformCookies,
  async applyLogin(p, cookies, username) {
    if (!cookies) {
      await clearCookies(p)
      const names = store.get('usernames')
      if (usesUsername(p) && names[p]) {
        const { [p]: _, ...rest } = names
        quietly(() => {
          store.set('usernames', rest)
          store.set('follows', { ...store.get('follows'), [p]: [] })
        })
      }
      return
    }
    await setCookies(p, cookies)
    if (usesUsername(p)) {
      quietly(() => store.set('usernames', { ...store.get('usernames'), [p]: username || 'Signed in' }))
      resync(p)
    }
  }
}

function quietly(fn: () => void): void {
  applying = true
  try {
    fn()
  } finally {
    applying = false
  }
}

// ---------- Sync ----------

/** Downloads, merges, applies what changed here and uploads the result. Safe to call any time. */
export function syncNow(): Promise<void> {
  if (!account.signedIn()) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = runSync()
    .then(() => {
      error = undefined
    })
    .catch((e) => {
      error = (e as Error).message
      console.error('[sync]', e)
    })
    .finally(() => {
      running = null
      onUpdate()
      if (again) {
        again = false
        void syncNow()
      }
    })
  onUpdate()
  return running
}

async function runSync(): Promise<void> {
  await syncOnce(device)
  // The account's address, if it couldn't be read at sign-in (e.g. Drive wasn't enabled yet).
  if (!email) {
    email = await drive.email()
    if (email) await store.setSecret(EMAIL_SECRET, email)
  }
}

function scheduleSoon(): void {
  if (!account.signedIn()) return
  if (changeTimer) clearTimeout(changeTimer)
  changeTimer = setTimeout(() => void syncNow(), AFTER_CHANGE_MS)
}

// ---------- Account ----------

export async function syncSignIn(): Promise<void> {
  await account.signIn()
  drive.reset()
  email = await drive.email()
  await store.setSecret(EMAIL_SECRET, email ?? null)
  await syncNow()
}

export async function syncSignOut(): Promise<void> {
  await account.signOut()
  await store.setSecret(EMAIL_SECRET, null)
  drive.reset()
  email = undefined
  error = undefined
  onUpdate()
}

/**
 * Starts syncing: watches the store for local changes and syncs now and every few minutes.
 * `update` publishes the status; `refollow` re-reads a platform's follows after a synced sign-in.
 */
export function startSync(update: () => void, refollow: (p: Platform) => void): void {
  onUpdate = update
  resync = refollow
  void store.getSecret<string>(EMAIL_SECRET).then((e) => {
    email = e ?? undefined
    onUpdate()
  })

  store.onChange((key, prev, next) => {
    if (applying) return
    const meta = structuredClone(store.get('syncMeta'))
    if (noteStoreChange(meta, key, prev, next, { data: syncedData(), watchLater: store.get('watchLater') }, Date.now())) {
      store.set('syncMeta', meta)
      scheduleSoon()
    }
  })

  void syncNow()
  setInterval(() => void syncNow(), PERIOD_MS)
}

/** The window came back: sync if it's been a minute. */
export function syncOnFocus(): void {
  if (Date.now() - store.get('syncMeta').lastSync > 60_000) void syncNow()
}
