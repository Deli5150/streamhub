import { describe, expect, it } from 'vitest'
import type { Platform, SavedItem, Settings } from '@shared/types'
import {
  emptyDoc,
  emptyMeta,
  fromFields,
  incomingFields,
  localDoc,
  mergeDocs,
  mergeLogins,
  mergeWatchLater,
  stampChanges,
  syncOnce,
  type SyncCookie,
  type SyncDevice,
  type SyncDoc,
  type SyncedData,
  type SyncMeta
} from '@shared/sync'

const data = (over: Partial<SyncedData> = {}): SyncedData => ({ settings: { theme: 'default', notifyLive: true }, muted: [], follows: {}, ...over })
const item = (id: string, savedAt: number): SavedItem => ({ id, kind: 'vod', channelKey: 'twitch:a', platform: 'twitch', displayName: 'A', savedAt })

describe('sync fields', () => {
  it('stamps only what changed', () => {
    const meta = emptyMeta()
    stampChanges(meta, { data: data(), watchLater: [] }, { data: data({ settings: { theme: 'ocean', notifyLive: true } }), watchLater: [] }, 100)
    expect(meta.fieldAt).toEqual({ 'settings.theme': 100 })
  })

  it('keeps the newer value of each field, from either side', () => {
    const meta = emptyMeta()
    meta.fieldAt['settings.theme'] = 200
    const local = localDoc(data({ settings: { theme: 'ocean', notifyLive: true } }), [], meta)
    const remote = localDoc(data({ settings: { theme: 'default', notifyLive: false } }), [], { ...emptyMeta(), fieldAt: { 'settings.theme': 100, 'settings.notifyLive': 150 } })
    const merged = mergeDocs(local, remote)
    expect(merged.fields['settings.theme'].value).toBe('ocean')
    expect(merged.fields['settings.notifyLive'].value).toBe(false)
    const incoming = incomingFields(local, merged)
    expect(Object.keys(incoming)).toEqual(['settings.notifyLive'])
    expect(fromFields({ 'settings.notifyLive': false, 'follows.kick': [], bogus: 1 }, data()).settings.notifyLive).toBe(false)
  })

  it('lets the cloud win on a new device (never-changed local values)', () => {
    const local = localDoc(data(), [], emptyMeta())
    const remote = localDoc(data({ muted: ['twitch:x'] }), [], { ...emptyMeta(), fieldAt: { muted: 5 } })
    expect(mergeDocs(local, remote).fields.muted.value).toEqual(['twitch:x'])
  })
})

describe('Watch Later merge', () => {
  it('unions items and honours removals', () => {
    const a = { items: [item('1', 10), item('2', 20)], removed: {}, orderAt: 50 }
    const b = { items: [item('2', 20), item('3', 30)], removed: { '1': 40 }, orderAt: 40 }
    const merged = mergeWatchLater(a, b)
    expect(merged.items.map((i) => i.id)).toEqual(['2', '3'])
  })

  it('brings back an item saved again after it was removed', () => {
    const merged = mergeWatchLater({ items: [item('1', 90)], removed: {}, orderAt: 90 }, { items: [], removed: { '1': 40 }, orderAt: 40 })
    expect(merged.items.map((i) => i.id)).toEqual(['1'])
  })

  it('records removals and reorders locally', () => {
    const meta = emptyMeta()
    stampChanges(meta, { data: data(), watchLater: [item('1', 1), item('2', 2)] }, { data: data(), watchLater: [item('2', 2)] }, 77)
    expect(meta.removed).toEqual({ '1': 77 })
    expect(meta.orderAt).toBe(77)
  })
})

describe('logins', () => {
  const cookie = (value: string): SyncCookie[] => [{ name: 'auth-token', value, domain: '.twitch.tv', path: '/', secure: true, httpOnly: false }]
  const signedIn = (...ps: Platform[]) => (p: Platform) => ps.includes(p)

  it('takes the newer sign-in per platform', () => {
    const remote = { twitch: { at: 100, cookies: cookie('r') }, kick: { at: 50, cookies: cookie('rk') } }
    const { entries, apply } = mergeLogins(remote, { kick: { at: 80, cookies: cookie('lk') } }, { twitch: 20, kick: 80 }, signedIn('twitch', 'kick'))
    expect(entries.kick?.cookies?.[0].value).toBe('lk')
    expect(entries.twitch?.cookies?.[0].value).toBe('r')
    expect(apply).toEqual(['twitch'])
  })

  it('keeps a sign-in made here before sync, but takes a sign-out from elsewhere', () => {
    expect(mergeLogins({ twitch: { at: 100, cookies: cookie('r') } }, {}, {}, signedIn('twitch')).apply).toEqual([])
    expect(mergeLogins({ twitch: { at: 100, cookies: null } }, {}, {}, signedIn('twitch')).apply).toEqual(['twitch'])
    expect(mergeLogins({ twitch: { at: 100, cookies: cookie('r') } }, {}, {}, signedIn()).apply).toEqual(['twitch'])
  })

  /** A device over a shared in-memory "Drive" file. */
  function fakeDevice(cloud: { doc: SyncDoc }, usernames: Partial<Record<Platform, string>>, jar: Partial<Record<Platform, SyncCookie[]>>) {
    let meta: SyncMeta = emptyMeta()
    let settings: Partial<Settings> = { theme: 'default' }
    const device: SyncDevice = {
      download: async () => JSON.parse(JSON.stringify(cloud.doc)),
      upload: async (doc) => void (cloud.doc = JSON.parse(JSON.stringify(doc))),
      data: () => ({ settings, muted: [], follows: {} }),
      watchLater: () => [],
      meta: () => meta,
      saveMeta: (m) => void (meta = m),
      applyFields: (patch) => void (settings = { ...settings, ...patch.settings }),
      setWatchLater: () => {},
      usernames: () => usernames,
      cookies: async (p) => jar[p] ?? [],
      applyLogin: async (p, cookies, username) => {
        if (cookies) {
          jar[p] = cookies
          usernames[p] = username ?? 'Signed in'
        } else {
          delete jar[p]
          delete usernames[p]
        }
      }
    }
    return { device, jar, usernames, settings: () => settings }
  }

  it('signs a new device in to the platforms of the first, with no passphrase', async () => {
    const cloud = { doc: emptyDoc() }
    const desktop = fakeDevice(cloud, { twitch: 'delvisonm' }, { twitch: cookie('token-1') })
    await syncOnce(desktop.device)
    expect(cloud.doc.logins.entries.twitch?.cookies?.[0].value).toBe('token-1')

    const phone = fakeDevice(cloud, {}, {})
    await syncOnce(phone.device)
    expect(phone.usernames.twitch).toBe('delvisonm')
    expect(phone.jar.twitch?.[0].value).toBe('token-1')
  })
})
