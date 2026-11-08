import { PLATFORMS, type Channel, type ImportedPlaylist, type Platform, type SavedItem, type Settings } from './types'

// "Sync with Google": settings, follows, Watch Later and platform logins kept in one JSON
// file in the user's own Google Drive app folder, shared by the desktop and mobile apps. This module
// is the format and the merge; each app reads its store into a doc, merges it with the downloaded
// one, applies what changed and uploads the result.
//
// Every synced value is a field with the time it last changed, and the newer one wins, so changes
// made on different devices to different things all survive. Watch Later merges item by item, with
// removal times so a video removed on one device goes everywhere. Logins are each platform's sign-in
// cookies, newest sign-in (or sign-out) winning; they're as private as the Google account's app
// folder, which only StreamHub can read.

export const SYNC_FILE = 'streamhub-sync.json'

/** Settings that follow you between devices (window/device-only ones such as wallpapers aren't in Settings). */
export const SYNCED_SETTINGS = ['theme', 'notifyLive', 'blockTwitchAds', 'pipOnMinimize', 'combined', 'shortcuts', 'menubar'] as const satisfies ReadonlyArray<keyof Settings>

export interface SyncField {
  at: number
  value: unknown
}

export interface LoginEntry {
  /** When this platform was last signed in or out. */
  at: number
  /** The sign-in's cookies, or null when signed out. */
  cookies: SyncCookie[] | null
  /** Account name shown in the app. */
  username?: string
}

export interface SyncDoc {
  version: 1
  updatedAt: number
  fields: Record<string, SyncField>
  watchLater: {
    items: SavedItem[]
    /** id → when it was removed. */
    removed: Record<string, number>
    /** When the list's order last changed. */
    orderAt: number
  }
  logins: {
    entries: Partial<Record<Platform, LoginEntry>>
  }
}

/** The parts of a device's store that sync. */
export interface SyncedData {
  settings: Partial<Settings>
  muted: string[]
  follows: Partial<Record<Platform, Channel[]>>
  /** Imported YouTube playlists (one field: the newest list wins). */
  ytPlaylists?: ImportedPlaylist[]
}

/** Per-device bookkeeping kept next to the store. */
export interface SyncMeta {
  /** Field key → when it last changed on this device (0/missing = never: the cloud's copy wins). */
  fieldAt: Record<string, number>
  removed: Record<string, number>
  orderAt: number
  /** Platform → when it was last signed in/out on this device, or when a synced login was applied. */
  loginAt: Partial<Record<Platform, number>>
  lastSync: number
}

export const emptyMeta = (): SyncMeta => ({ fieldAt: {}, removed: {}, orderAt: 0, loginAt: {}, lastSync: 0 })
export const emptyDoc = (): SyncDoc => ({ version: 1, updatedAt: 0, fields: {}, watchLater: { items: [], removed: {}, orderAt: 0 }, logins: { entries: {} } })

/** A store's synced values as flat fields ("settings.theme", "muted", "follows.twitch"). */
export function toFields(d: SyncedData): Record<string, unknown> {
  const out: Record<string, unknown> = { muted: d.muted }
  for (const k of SYNCED_SETTINGS) if (d.settings[k] !== undefined) out[`settings.${k}`] = d.settings[k]
  for (const p of PLATFORMS) if (d.follows[p]) out[`follows.${p}`] = d.follows[p]
  if (d.ytPlaylists) out.ytPlaylists = d.ytPlaylists
  return out
}

/** Fields back into store values (only the parts present). */
export function fromFields(fields: Record<string, unknown>, base: SyncedData): SyncedData {
  const settings: Partial<Settings> = { ...base.settings }
  const follows = { ...base.follows }
  let muted = base.muted
  let ytPlaylists = base.ytPlaylists
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'muted') muted = v as string[]
    else if (k === 'ytPlaylists') ytPlaylists = v as ImportedPlaylist[]
    else if (k.startsWith('settings.') && (SYNCED_SETTINGS as readonly string[]).includes(k.slice(9))) (settings as Record<string, unknown>)[k.slice(9)] = v
    else if (k.startsWith('follows.') && PLATFORMS.includes(k.slice(8) as Platform)) follows[k.slice(8) as Platform] = v as Channel[]
  }
  return { settings, muted, follows, ytPlaylists }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * Records local changes in the meta: fields whose value changed get `now`, Watch Later removals get a
 * removal time, and a changed order gets a new order time. Returns whether anything changed.
 */
export function stampChanges(meta: SyncMeta, prev: { data: SyncedData; watchLater: SavedItem[] }, next: { data: SyncedData; watchLater: SavedItem[] }, now: number): boolean {
  let changed = false
  const a = toFields(prev.data)
  const b = toFields(next.data)
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!same(a[k], b[k])) {
      meta.fieldAt[k] = now
      changed = true
    }
  }
  const nextIds = new Set(next.watchLater.map((i) => i.id))
  for (const i of prev.watchLater) {
    if (!nextIds.has(i.id)) {
      meta.removed[i.id] = now
      changed = true
    }
  }
  if (!same(prev.watchLater.map((i) => i.id), next.watchLater.map((i) => i.id)) || !same(prev.watchLater, next.watchLater)) {
    meta.orderAt = now
    changed = true
  }
  return changed
}

/** This device's state as a doc (logins are added separately, see mergeLogins). */
export function localDoc(data: SyncedData, watchLater: SavedItem[], meta: SyncMeta): SyncDoc {
  const fields: Record<string, SyncField> = {}
  for (const [k, value] of Object.entries(toFields(data))) fields[k] = { at: meta.fieldAt[k] ?? 0, value }
  return { ...emptyDoc(), fields, watchLater: { items: watchLater, removed: { ...meta.removed }, orderAt: meta.orderAt } }
}

/** Merges two docs' fields and Watch Later (logins: see mergeLogins). The newer value of each wins. */
export function mergeDocs(local: SyncDoc, remote: SyncDoc): SyncDoc {
  const fields: Record<string, SyncField> = { ...remote.fields }
  for (const [k, f] of Object.entries(local.fields)) {
    // Ties (e.g. two never-changed copies) go to the cloud, so a new device takes on your settings.
    if (!fields[k] || f.at > fields[k].at) fields[k] = f
  }
  return { ...remote, version: 1, fields, watchLater: mergeWatchLater(local.watchLater, remote.watchLater) }
}

export function mergeWatchLater(a: SyncDoc['watchLater'], b: SyncDoc['watchLater']): SyncDoc['watchLater'] {
  const removed: Record<string, number> = { ...b.removed }
  for (const [id, at] of Object.entries(a.removed)) removed[id] = Math.max(at, removed[id] ?? 0)
  // The list ordered most recently leads; items only the other one has follow, newest saved first.
  const [first, second] = a.orderAt > b.orderAt ? [a, b] : [b, a]
  const byId = new Map<string, SavedItem>()
  for (const i of first.items) byId.set(i.id, i)
  const extra = second.items.filter((i) => !byId.has(i.id)).sort((x, y) => y.savedAt - x.savedAt)
  for (const i of extra) byId.set(i.id, i)
  // An item removed after it was (last) saved stays removed; saved again later, it comes back.
  const items = [...byId.values()].filter((i) => !(removed[i.id] >= i.savedAt))
  // Keep removal records only while they still matter (a month), so the file doesn't grow forever.
  const cutoff = Math.max(a.orderAt, b.orderAt) - 30 * 24 * 60 * 60_000
  for (const [id, at] of Object.entries(removed)) if (at < cutoff) delete removed[id]
  return { items, removed, orderAt: Math.max(a.orderAt, b.orderAt) }
}

/** Field values in `merged` that differ from this device's, i.e. what to apply locally. */
export function incomingFields(local: SyncDoc, merged: SyncDoc): Record<string, SyncField> {
  const out: Record<string, SyncField> = {}
  for (const [k, f] of Object.entries(merged.fields)) if (!local.fields[k] || !same(local.fields[k].value, f.value)) out[k] = f
  return out
}

// ---------- Logins ----------

/** One cookie, in a shape both Electron and the phones' cookie stores can set. */
export interface SyncCookie {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  /** Set for one host only (no Domain attribute). */
  hostOnly?: boolean
  /** Seconds since 1970; missing for session cookies. */
  expirationDate?: number
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
}

/** Sites whose cookies make up each platform's sign-in. */
export const LOGIN_DOMAINS: Record<Platform, string[]> = {
  twitch: ['twitch.tv'],
  youtube: ['youtube.com', 'google.com'],
  kick: ['kick.com'],
  rumble: ['rumble.com']
}

export const cookieMatches = (p: Platform, domain: string): boolean => {
  const d = domain.replace(/^\./, '')
  return LOGIN_DOMAINS[p].some((root) => d === root || d.endsWith(`.${root}`))
}

/**
 * Merges login entries. `local` holds this device's platforms whose sign-in changed after the cloud's
 * copy. Returns the merged entries and the platforms to apply here (the cloud's is newer). A platform
 * signed in here before sync was turned on (no recorded change) keeps its own sign-in rather than
 * taking another device's; a sign-out from another device still applies.
 */
export function mergeLogins(
  remote: SyncDoc['logins']['entries'],
  local: Partial<Record<Platform, LoginEntry>>,
  loginAt: SyncMeta['loginAt'],
  signedIn: (p: Platform) => boolean
): { entries: SyncDoc['logins']['entries']; apply: Platform[] } {
  const entries = { ...remote }
  const apply: Platform[] = []
  for (const p of PLATFORMS) {
    const mine = local[p]
    const theirs = remote[p]
    if (mine && (!theirs || mine.at > theirs.at)) entries[p] = mine
    else if (theirs && theirs.at > (loginAt[p] ?? 0)) {
      const keepOwn = !loginAt[p] && signedIn(p) && theirs.cookies
      if (!keepOwn) apply.push(p)
    }
  }
  return { entries, apply }
}

// ---------- One sync, for any device ----------

/** What a device provides to sync: its store and its cookies. */
export interface SyncDevice {
  download(): Promise<SyncDoc>
  upload(doc: SyncDoc): Promise<void>
  data(): SyncedData
  watchLater(): SavedItem[]
  meta(): SyncMeta
  saveMeta(meta: SyncMeta): void
  /** Applies values that changed on another device (settings as a patch, follows per platform). */
  applyFields(patch: FieldPatch): void
  setWatchLater(items: SavedItem[]): void
  usernames(): Partial<Record<Platform, string>>
  cookies(p: Platform): Promise<SyncCookie[]>
  /** Signs a platform in (cookies, username) or out (cookies null) as another device did. */
  applyLogin(p: Platform, cookies: SyncCookie[] | null, username: string | undefined): Promise<void>
}

export interface FieldPatch {
  settings?: Partial<Settings>
  muted?: string[]
  follows?: SyncedData['follows']
  ytPlaylists?: ImportedPlaylist[]
}

/** Field values to store values (settings as a patch, follows per platform). */
export function fieldsToPatch(values: Record<string, unknown>): FieldPatch {
  const out: FieldPatch = {}
  for (const [k, v] of Object.entries(values)) {
    if (k === 'muted') out.muted = v as string[]
    else if (k === 'ytPlaylists') out.ytPlaylists = v as ImportedPlaylist[]
    else if (k.startsWith('settings.') && (SYNCED_SETTINGS as readonly string[]).includes(k.slice(9))) out.settings = { ...out.settings, [k.slice(9)]: v }
    else if (k.startsWith('follows.') && PLATFORMS.includes(k.slice(8) as Platform)) out.follows = { ...out.follows, [k.slice(8)]: v as Channel[] }
  }
  return out
}

/** Downloads, merges, applies what changed elsewhere and uploads the result. */
export async function syncOnce(device: SyncDevice): Promise<void> {
  const remote = await device.download()
  const meta: SyncMeta = JSON.parse(JSON.stringify(device.meta()))
  const watchLater = device.watchLater()
  const local = localDoc(device.data(), watchLater, meta)
  const merged = mergeDocs(local, remote)

  const incoming = incomingFields(local, merged)
  if (Object.keys(incoming).length) {
    device.applyFields(fieldsToPatch(Object.fromEntries(Object.entries(incoming).map(([k, f]) => [k, f.value]))))
    for (const [k, f] of Object.entries(incoming)) meta.fieldAt[k] = f.at
  }
  if (!same(merged.watchLater.items, watchLater)) device.setWatchLater(merged.watchLater.items)
  meta.removed = merged.watchLater.removed
  meta.orderAt = merged.watchLater.orderAt

  // Logins: this device's sign-ins and sign-outs since the cloud's copy, plus any platform signed in
  // here that the cloud has nothing for yet (so turning sync on brings your sign-ins along).
  const names = device.usernames()
  const mine: Partial<Record<Platform, LoginEntry>> = {}
  for (const p of PLATFORMS) {
    const theirs = remote.logins.entries[p]
    let at = meta.loginAt[p] ?? 0
    if (!theirs && !at && names[p]) at = meta.loginAt[p] = Date.now()
    if (!at || at <= (theirs?.at ?? 0)) continue
    mine[p] = { at, cookies: names[p] ? await device.cookies(p) : null, username: names[p] }
  }
  const { entries, apply } = mergeLogins(remote.logins.entries, mine, meta.loginAt, (p) => Boolean(names[p]))
  merged.logins = { entries }
  for (const p of apply) {
    const entry = entries[p]!
    await device.applyLogin(p, entry.cookies, entry.username)
    meta.loginAt[p] = entry.at
  }

  if (!same({ ...merged, updatedAt: 0 }, { ...remote, updatedAt: 0 })) {
    merged.updatedAt = Date.now()
    await device.upload(merged)
  }
  meta.lastSync = Date.now()
  device.saveMeta(meta)
}

/** Records a local store change in the meta (see stampChanges); returns whether to sync soon. */
export function noteStoreChange(
  meta: SyncMeta,
  key: string,
  prev: unknown,
  next: unknown,
  current: { data: SyncedData; watchLater: SavedItem[] },
  now: number
): boolean {
  if (key === 'settings' || key === 'muted' || key === 'follows' || key === 'ytPlaylists' || key === 'watchLater') {
    const before = {
      data: { ...current.data, ...(key === 'watchLater' ? {} : { [key]: prev }) } as SyncedData,
      watchLater: key === 'watchLater' ? (prev as SavedItem[]) : current.watchLater
    }
    return stampChanges(meta, before, current, now)
  }
  if (key === 'usernames') {
    // Signed in or out of a platform here: its login goes up with the next sync.
    const a = (prev ?? {}) as Partial<Record<Platform, string>>
    const b = (next ?? {}) as Partial<Record<Platform, string>>
    let changed = false
    for (const p of PLATFORMS) {
      if (Boolean(a[p]) !== Boolean(b[p])) {
        meta.loginAt[p] = now
        changed = true
      }
    }
    return changed
  }
  return false
}

/** Cookies → the shape to keep, from a store that may not know domains (Android): host-wide on the site. */
export const siteCookie = (p: Platform, c: Partial<SyncCookie> & { name: string; value: string }): SyncCookie => ({
  name: c.name,
  value: c.value,
  domain: c.domain || `.${LOGIN_DOMAINS[p][0]}`,
  path: c.path || '/',
  secure: c.secure ?? true,
  httpOnly: c.httpOnly ?? false,
  hostOnly: c.hostOnly,
  expirationDate: c.expirationDate,
  sameSite: c.sameSite
})
