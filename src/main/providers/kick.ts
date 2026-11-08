import type { ChannelAbout, ChannelPageData, LiveInfo } from '@shared/types'
import { getJson, mapLimit, sessionFor } from '../net'
import { store } from '../store'
import {
  parseKickAbout,
  parseKickClips,
  parseKickFollowed,
  parseKickLivestream,
  parseKickVideos,
  type KickChannelResponse,
  type KickClipsResponse,
  type KickLinksResponse,
  type KickFollowedResponse,
  type KickLivestreamResponse,
  type KickVideoItem
} from './parsers'
import { loginWindow, type Provider } from './types'

// Kick's public API has no "followed channels" endpoint, so this uses the same internal endpoints
// kick.com calls, authenticated with the browser session cookie from the sign-in window.

async function sessionToken(): Promise<string | undefined> {
  const [c] = await sessionFor('kick').cookies.get({ url: 'https://kick.com', name: 'session_token' })
  return c ? decodeURIComponent(c.value) : undefined
}

async function kickApi<T>(path: string): Promise<T> {
  const token = await sessionToken()
  return getJson<T>('kick', `https://kick.com${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
}

// A follows sync is immediately followed by a live poll; share one fetch between them.
let recent: { at: number; result: Promise<ReturnType<typeof parseKickFollowed>> } | null = null
function fetchFollowed(): Promise<ReturnType<typeof parseKickFollowed>> {
  if (recent && Date.now() - recent.at < 10_000) return recent.result
  const result = fetchFollowedUncached()
  recent = { at: Date.now(), result }
  result.catch(() => (recent = null))
  return result
}

async function fetchFollowedUncached(): Promise<ReturnType<typeof parseKickFollowed>> {
  const all: ReturnType<typeof parseKickFollowed> = { channels: [], live: [] }
  let cursor: number | null | undefined = 0
  for (let guard = 0; cursor !== null && cursor !== undefined && guard < 50; guard++) {
    const res: KickFollowedResponse = await kickApi(`/api/v2/channels/followed?cursor=${cursor}`)
    const page = parseKickFollowed(res)
    all.channels.push(...page.channels)
    all.live.push(...page.live)
    cursor = res.nextCursor && res.nextCursor !== cursor ? res.nextCursor : null
  }
  return all
}

export const kick: Provider = {
  platform: 'kick',
  liveIntervalMs: 60_000,
  isConnected: () => Boolean(store.get('usernames').kick),
  username: () => store.get('usernames').kick,

  async login() {
    let username: string | undefined
    await loginWindow('kick', 'https://kick.com/', async () => {
      if (!(await sessionToken())) return false
      const me = await kickApi<{ username?: string }>('/api/v1/user').catch(() => null)
      username = me?.username
      return Boolean(username)
    })
    store.set('usernames', { ...store.get('usernames'), kick: username })
  },

  async logout() {
    const { kick: _, ...rest } = store.get('usernames')
    store.set('usernames', rest)
    await sessionFor('kick').clearStorageData()
  },

  async getFollows() {
    return (await fetchFollowed()).channels
  },

  async getLive(channels) {
    const live: LiveInfo[] = (await fetchFollowed()).live
    const liveKeys = new Set(live.map((l) => l.key))
    // The followed list has no thumbnails or start times; look those up for live channels only.
    const lookups = channels.filter((c) => liveKeys.has(c.key))
    const details = await mapLimit(lookups, 6, (c) =>
      kickApi<KickLivestreamResponse>(`/api/v2/channels/${c.id}/livestream`).then((r) => parseKickLivestream(r, c.id), () => undefined)
    )
    const byKey = new Map(live.map((l) => [l.key, l]))
    for (const d of details) if (d) byKey.set(d.key, { ...byKey.get(d.key)!, ...d, category: d.category ?? byKey.get(d.key)?.category })
    return [...byKey.values()]
  },

  async getLiveSignedOut(channels) {
    const found = await mapLimit(channels, 6, (c) =>
      kickApi<KickLivestreamResponse>(`/api/v2/channels/${c.id}/livestream`).then((r) => parseKickLivestream(r, c.id), () => undefined)
    )
    return found.filter((l): l is LiveInfo => Boolean(l))
  },

  async getChannelPage(ch) {
    const [videos, clips] = await Promise.all([
      kickApi<KickVideoItem[]>(`/api/v2/channels/${ch.id}/videos`).catch(() => []),
      kickApi<KickClipsResponse>(`/api/v2/channels/${ch.id}/clips?sort=date&time=all`).catch(() => ({}))
    ])
    const clipPage = parseKickClips(clips)
    return {
      streams: parseKickVideos(Array.isArray(videos) ? videos : []),
      videos: [],
      clips: clipPage.items,
      // Kick's /videos endpoint returns everything it has at once; clips page by cursor.
      cursors: { streams: null, videos: null, clips: clipPage.cursor },
      hasVideos: false,
      clipsLabel: 'Clips'
    } satisfies ChannelPageData
  },

  async loadMore(ch, category, cursor) {
    if (category !== 'clips') return { items: [], cursor: null }
    return parseKickClips(await kickApi<KickClipsResponse>(`/api/v2/channels/${ch.id}/clips?sort=date&time=all&cursor=${encodeURIComponent(cursor)}`))
  },

  async getAbout(ch): Promise<ChannelAbout> {
    const [channel, links] = await Promise.all([
      kickApi<KickChannelResponse>(`/api/v2/channels/${ch.id}`),
      // A channel with no About panels can 404 here; the bio and socials are still worth showing.
      kickApi<KickLinksResponse>(`/api/v2/channels/${ch.id}/links`).catch(() => [])
    ])
    return parseKickAbout(channel, links)
  }
}
