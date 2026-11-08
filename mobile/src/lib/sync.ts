import { Platform as OS } from 'react-native'
import CookieManager from '@preeternal/react-native-cookie-manager'
import { noteStoreChange, siteCookie, syncOnce, type SyncCookie, type SyncDevice, type SyncedData, type SyncMeta } from '@shared/sync'
import { driveFile } from '@shared/syncDrive'
import type { Platform, SyncStatus } from '@shared/types'
import { googleEmail, googleFetch, googleSyncSignIn, googleSyncSignOut } from '../desktop/googleAuth'
import { LOGIN_ORIGINS, sessionFor } from '../desktop/net'
import { store } from '../desktop/store'
import { getSettings, updateSettings } from './settings'

// Sync with Google on the phone (the desktop's src/main/sync.ts; format and merge in
// src/shared/sync.ts). Same file in your Drive, so the phone and computers share settings, follows,
// Watch Later and platform sign-ins.

const PERIOD_MS = 5 * 60_000
const AFTER_CHANGE_MS = 5_000
const WEBKIT = { iosCookieStore: 'webKit' } as const

const drive = driveFile(googleFetch)
let running: Promise<void> | null = null
let again = false
let applying = false
let error: string | undefined
let changeTimer: ReturnType<typeof setTimeout> | null = null
let started = false
let onUpdate: () => void = () => {}
let resync: (p: Platform) => void = () => {}

export function syncStatus(): SyncStatus {
  return {
    signedIn: store.get('syncEnabled'),
    email: store.get('syncEnabled') ? googleEmail() : undefined,
    lastSync: store.get('syncMeta').lastSync || undefined,
    syncing: Boolean(running),
    error
  }
}

const syncedData = (): SyncedData => ({ settings: getSettings(), muted: store.get('muted'), follows: store.get('follows') })

function quietly(fn: () => void): void {
  applying = true
  try {
    fn()
  } finally {
    applying = false
  }
}

const SAME_SITE: Record<string, 'lax' | 'strict' | 'none'> = { lax: 'lax', strict: 'strict', no_restriction: 'none' }

/** A platform's sign-in cookies. Android's cookie store doesn't say which domain a cookie is for, so those count as site-wide. */
async function platformCookies(p: Platform): Promise<SyncCookie[]> {
  const byKey = new Map<string, SyncCookie>()
  for (const origin of LOGIN_ORIGINS[p]) {
    const cookies = await CookieManager.getAsArray(origin, WEBKIT).catch(() => [])
    for (const c of cookies) {
      const expires = c.expires ? Date.parse(c.expires) : NaN
      const cookie = siteCookie(p, {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        expirationDate: Number.isFinite(expires) ? expires / 1000 : undefined
      })
      byKey.set(`${cookie.domain}|${cookie.path}|${cookie.name}`, cookie)
    }
  }
  return [...byKey.values()]
}

async function setCookies(cookies: SyncCookie[]): Promise<void> {
  for (const c of cookies) {
    const host = c.domain.replace(/^\./, '')
    await CookieManager.set(
      `https://${host}${c.path || '/'}`,
      {
        name: c.name,
        value: c.value,
        ...(c.hostOnly ? {} : { domain: c.domain }),
        path: c.path || '/',
        secure: c.secure,
        httpOnly: c.httpOnly,
        ...(c.expirationDate ? { expires: new Date(c.expirationDate * 1000).toISOString() } : {}),
        ...(c.sameSite && SAME_SITE[c.sameSite] ? { sameSite: SAME_SITE[c.sameSite] } : {})
      },
      WEBKIT
    ).catch((e: unknown) => console.warn(`[sync] cookie ${c.name}:`, (e as Error).message))
  }
  await CookieManager.flush().catch(() => undefined)
}

/** On iPhone YouTube is connected through Google's sign-in, so a synced login only brings chat's cookies. */
const usesUsername = (p: Platform): boolean => p !== 'youtube' || OS.OS === 'android'

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
      await sessionFor(p).clearStorageData()
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
    await setCookies(cookies)
    if (usesUsername(p)) {
      quietly(() => store.set('usernames', { ...store.get('usernames'), [p]: username || 'Signed in' }))
      resync(p)
    }
  }
}

/** Downloads, merges, applies what changed elsewhere and uploads. Safe to call any time. */
export function syncNow(): Promise<void> {
  if (!store.get('syncEnabled')) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = syncOnce(device)
    .then(() => {
      error = undefined
    })
    .catch((e: unknown) => {
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

function scheduleSoon(): void {
  if (!store.get('syncEnabled')) return
  if (changeTimer) clearTimeout(changeTimer)
  changeTimer = setTimeout(() => void syncNow(), AFTER_CHANGE_MS)
}

export async function syncSignIn(): Promise<void> {
  await googleSyncSignIn()
  drive.reset()
  store.set('syncEnabled', true)
  await syncNow()
}

export async function syncSignOut(): Promise<void> {
  store.set('syncEnabled', false)
  await googleSyncSignOut()
  drive.reset()
  error = undefined
  onUpdate()
}

/**
 * Starts syncing (the store must be loaded): watches it for local changes and syncs now and every few
 * minutes while the app is open. `update` publishes the status; `refollow` re-reads a platform's
 * follows after a synced sign-in.
 */
export function startSync(update: () => void, refollow: (p: Platform) => void): void {
  if (started) return
  started = true
  onUpdate = update
  resync = refollow
  store.onChange((key, prev, next) => {
    if (applying) return
    const meta = JSON.parse(JSON.stringify(store.get('syncMeta'))) as SyncMeta
    if (noteStoreChange(meta, key, prev, next, { data: syncedData(), watchLater: store.get('watchLater') }, Date.now())) {
      store.set('syncMeta', meta)
      scheduleSoon()
    }
  })
  void syncNow()
  setInterval(() => void syncNow(), PERIOD_MS)
}

/** The app came to the foreground: sync if it's been a minute. */
export function syncOnForeground(): void {
  if (Date.now() - store.get('syncMeta').lastSync > 60_000) void syncNow()
}
