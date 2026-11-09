import type { Channel, ChannelAbout, ChannelPageData, LiveInfo, MediaCategory, MediaItem, SavedItem, VideoChapter, YouTubePlaylistSummary } from '@shared/types'
import { readPage } from '../hidden'
import { googleGet, googleSignedIn, googleSignIn, googleSignOut } from '../googleAuth'
import { getJson, getText, mapLimit } from '../net'
import { store } from '../store'
import {
  extractYtInitialData,
  parseTimeAgo,
  parseYouTubeChapters,
  parseYouTubePlaylistItems,
  parseYouTubePlaylists,
  parseYouTubeBanner,
  parseYouTubeDescription,
  parseYouTubeResolve,
  parseYouTubeSubscriptions,
  parseYouTubeVideoStatuses,
  youTubeSelectedTabUrl,
  type YouTubePlaylistItemsResponse,
  type YouTubePlaylistsResponse,
  type YouTubeResolveResponse,
  type YouTubeSubscriptionsResponse,
  type YouTubeVideosResponse
} from './parsers'
import { collectYouTubeTab, type ScrapedMedia } from './pageScripts'
import type { Provider } from './types'

// You sign in with Google in your own browser (googleAuth.ts); subscriptions come from the YouTube
// Data API. Live status: youtube.com/channel/<id>/live leads to the stream when the channel is live
// (or has one scheduled), which YouTube's public URL resolver answers in ~1 KB; the Data API then
// says which of those are live now, with title and viewers (one cheap call per 50). Channel pages
// and descriptions are read from public pages. (The Data API's own live search costs 100 quota
// units a call, and YouTube's channel RSS feeds no longer exist.)

const API = 'https://www.googleapis.com/youtube/v3'
/** How long a live check waits for the Data API before using the public player instead. */
const API_WAIT_MS = 1500
/** Whether the last live check went without the Data API's viewer counts (it was slow, not failing). */
let partial = false

/** Which of these videos are live, with title and viewers, from the Data API (50 per call). */
async function apiLiveStatuses(ids: string[]): Promise<LiveInfo[]> {
  const live: LiveInfo[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const res = await googleGet<YouTubeVideosResponse>(`${API}/videos?part=snippet,liveStreamingDetails&maxResults=50&id=${ids.slice(i, i + 50).join(',')}`)
    live.push(...parseYouTubeVideoStatuses(res).live)
  }
  return live
}

/** Whether a channel's video is live now, from YouTube's public player endpoint (no viewer count). */
async function liveFromPlayer(c: Channel, id: string): Promise<LiveInfo | null> {
  const player = await youtubei<YouTubePlayerResponse>('player', { videoId: id }).catch(() => null)
  const v = player?.videoDetails
  const broadcast = player?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails
  if (!v?.isLive || v.channelId !== c.id) return null
  return {
    key: c.key,
    title: v.title || '',
    startedAt: broadcast?.startTimestamp,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault_live.jpg`,
    streamId: id
  }
}

/** Live checks in flight at once (YouTube's URL resolver). */
const RESOLVE_CONCURRENCY = 24
/** Imported playlists read up to this many pages of 50 videos. */
const PLAYLIST_PAGES = 20
/** Client the URL resolver is called as (any recent web client version is accepted). */
const RESOLVER_CLIENT = { clientName: 'WEB', clientVersion: '2.20251001.00.00', hl: 'en' }

/** YouTube's own public web API (no sign-in). */
const youtubei = <T>(endpoint: string, body: Record<string, unknown>): Promise<T> =>
  getJson<T>('youtube', `https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: { client: RESOLVER_CLIENT }, ...body })
  })

/** The video a channel's /live page leads to (live now or scheduled), or null. */
const resolveLive = (c: Channel): Promise<string | null> =>
  youtubei<YouTubeResolveResponse>('navigation/resolve_url', { url: `https://www.youtube.com/channel/${c.id}/live` }).then(parseYouTubeResolve, () => null)

interface YouTubePlayerResponse {
  videoDetails?: { isLive?: boolean; title?: string; channelId?: string }
  microformat?: { playerMicroformatRenderer?: { liveBroadcastDetails?: { isLiveNow?: boolean; startTimestamp?: string } } }
}

export const youtube: Provider = {
  platform: 'youtube',
  liveIntervalMs: 2 * 60_000,
  isConnected: () => googleSignedIn(),
  username: () => (googleSignedIn() ? store.get('usernames').youtube || 'Signed in' : undefined),

  async login() {
    await googleSignIn()
    const me = await googleGet<{ items?: Array<{ snippet?: { title?: string } }> }>(`${API}/channels?part=snippet&mine=true`).catch(() => null)
    store.set('usernames', { ...store.get('usernames'), youtube: me?.items?.[0]?.snippet?.title || 'Signed in' })
  },

  async logout() {
    const { youtube: _, ...rest } = store.get('usernames')
    store.set('usernames', rest)
    await googleSignOut()
  },

  async getFollows() {
    const all: Channel[] = []
    let page: string | null = null
    for (let i = 0; i < 100; i++) {
      const res: YouTubeSubscriptionsResponse = await googleGet<YouTubeSubscriptionsResponse>(
        `${API}/subscriptions?part=snippet&mine=true&maxResults=50&order=alphabetical${page ? `&pageToken=${page}` : ''}`
      )
      const parsed = parseYouTubeSubscriptions(res)
      all.push(...parsed.channels)
      if (!parsed.next) break
      page = parsed.next
    }
    return all
  },

  async getLive(channels) {
    // Which channels' /live page leads to a video (public, no quota). Each answer is ~1 KB, so many
    // at once: a few hundred channels take a couple of seconds rather than eight or more.
    const found = await mapLimit(channels, RESOLVE_CONCURRENCY, (c) => resolveLive(c))
    // Which of those videos are live now (vs. scheduled), with viewers: the Data API, up to 50 per
    // call. Its sign-in can take a few seconds to read at launch (the keychain), and the API has a
    // daily quota, so if it isn't back quickly, YouTube's public player answers instead (live or
    // not, without viewer counts) and the hub asks again shortly for the viewers.
    const ids = [...new Set(found.filter((id): id is string => Boolean(id)))]
    const fromApi = apiLiveStatuses(ids)
    const quick = await Promise.race([fromApi.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), API_WAIT_MS))])
    let live = quick
    // Without the API's answer, the next check (moments later) brings the viewer counts.
    partial = !live
    if (!live) {
      fromApi.catch(() => undefined)
      const withVideo = channels.flatMap((c, i) => (found[i] ? [{ c, id: found[i]! }] : []))
      const statuses = await mapLimit(withVideo, RESOLVE_CONCURRENCY, ({ c, id }) => liveFromPlayer(c, id))
      live = statuses.filter((l): l is LiveInfo => Boolean(l))
    }
    // One entry per channel (a channel can run two streams at once; keep the bigger one).
    const known = new Set(channels.map((c) => c.key))
    const byKey = new Map<string, LiveInfo>()
    for (const l of live) if (known.has(l.key) && (byKey.get(l.key)?.viewers ?? -1) < (l.viewers ?? 0)) byKey.set(l.key, l)
    return [...byKey.values()]
  },

  liveIsPartial: () => partial,

  async getLiveSignedOut(channels) {
    // The same public resolver, then YouTube's player endpoint (public too) for whether it's live now.
    const found = await mapLimit(channels, RESOLVE_CONCURRENCY, async (c) => {
      const id = await resolveLive(c)
      return id ? liveFromPlayer(c, id) : null
    })
    return found.filter((l): l is LiveInfo => Boolean(l))
  },

  async getPlaylists() {
    const mine: YouTubePlaylistSummary[] = []
    let page: string | null = null
    for (let i = 0; i < 20; i++) {
      const res: YouTubePlaylistsResponse = await googleGet<YouTubePlaylistsResponse>(
        `${API}/playlists?part=snippet,contentDetails&mine=true&maxResults=50${page ? `&pageToken=${page}` : ''}`
      )
      const parsed = parseYouTubePlaylists(res)
      mine.push(...parsed.playlists)
      if (!parsed.next) break
      page = parsed.next
    }
    // Liked videos is a playlist too, though it isn't listed with the others. (Watch Later is
    // hidden from the API altogether.)
    const me = await googleGet<{ items?: Array<{ contentDetails?: { relatedPlaylists?: { likes?: string } } }> }>(`${API}/channels?part=contentDetails&mine=true`).catch(() => null)
    const likes = me?.items?.[0]?.contentDetails?.relatedPlaylists?.likes
    return likes ? [{ id: likes, title: 'Liked videos' }, ...mine] : mine
  },

  async getPlaylistVideos(id) {
    const all: Array<Omit<SavedItem, 'savedAt'>> = []
    let page: string | null = null
    for (let i = 0; i < PLAYLIST_PAGES; i++) {
      const res: YouTubePlaylistItemsResponse = await googleGet<YouTubePlaylistItemsResponse>(
        `${API}/playlistItems?part=snippet,status&playlistId=${encodeURIComponent(id)}&maxResults=50${page ? `&pageToken=${page}` : ''}`
      )
      const parsed = parseYouTubePlaylistItems(res)
      all.push(...parsed.items)
      if (!parsed.next) break
      page = parsed.next
    }
    return all
  },

  async getChannelPage(ch) {
    const [streams, videos, shorts] = await Promise.all(TABS.map((tab) => fetchTab(ch, tab)))
    return {
      bannerUrl: streams.banner ?? videos.banner ?? shorts.banner,
      streams: streams.items,
      videos: videos.items,
      clips: shorts.items,
      cursors: { streams: streams.cursor, videos: videos.cursor, clips: shorts.cursor },
      hasVideos: true,
      clipsLabel: 'Shorts'
    } satisfies ChannelPageData
  },

  async loadMore(ch, category, cursor) {
    // Further pages need YouTube's own scrolling, so read the tab in a hidden window and scroll it.
    const tab = TAB_FOR[category]
    const loaded = Number(cursor) || 0
    const script = `(async () => {
      const collect = ${collectYouTubeTab.toString()}
      const read = () => collect([window.ytInitialData, ...Array.from(document.querySelectorAll('ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer'), (el) => el.data)], ${JSON.stringify(tab)})
      if (!window.ytInitialData) return null
      let last = -1
      for (let i = 0, stable = 0; i < 40 && stable < 4; i++) {
        const n = read().items.length
        if (n >= ${loaded + PAGE_SIZE}) break
        stable = n === last ? stable + 1 : 0
        last = n
        window.scrollTo(0, document.documentElement.scrollHeight)
        await new Promise((r) => setTimeout(r, 500))
      }
      return read()
    })()`
    const result = await readPage<{ items: ScrapedMedia[]; more: boolean }>('youtube', 'videos', `https://www.youtube.com/channel/${ch.id}/${tab}?hl=en`, script, 60_000)
    const items = result.items.slice(loaded).map((m) => toMedia(m, tab))
    return { items, cursor: items.length && result.more ? String(loaded + items.length) : null }
  },

  async getAbout(_ch, live): Promise<ChannelAbout> {
    if (!live?.streamId) return { kind: 'description', links: [], panels: [] }
    const html = await getText('youtube', `https://www.youtube.com/watch?v=${live.streamId}&hl=en`, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9' }
    })
    return parseYouTubeDescription(html)
  }
}

type Tab = 'streams' | 'videos' | 'shorts'
const TABS: Tab[] = ['streams', 'videos', 'shorts']
const TAB_FOR: Record<MediaCategory, Tab> = { streams: 'streams', videos: 'videos', clips: 'shorts' }
const PAGE_SIZE = 30

function toMedia(m: ScrapedMedia, tab: Tab): MediaItem {
  return {
    ...m,
    kind: tab === 'streams' ? 'vod' : tab === 'shorts' ? 'short' : 'video',
    title: m.title || 'Untitled',
    publishedAt: parseTimeAgo(m.publishedText),
    playUrl: `https://www.youtube.com/embed/${m.id}?autoplay=1`
  }
}

/** One channel tab as public HTML (English, so dates/views parse); first page plus a paging cursor. */
async function fetchTab(ch: Channel, tab: Tab): Promise<{ items: MediaItem[]; cursor: string | null; banner?: string }> {
  try {
    const html = await getText('youtube', `https://www.youtube.com/channel/${ch.id}/${tab}?hl=en`, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9' }
    })
    const data = extractYtInitialData(html)
    const banner = parseYouTubeBanner(data)
    // A channel without this tab gets its Home tab instead; don't show that content as e.g. past streams.
    const served = youTubeSelectedTabUrl(data)
    if (served && !served.split('?')[0].endsWith(`/${tab}`)) return { items: [], cursor: null, banner }
    const { items, more } = collectYouTubeTab(data, tab)
    return { items: items.map((m) => toMedia(m, tab)), cursor: more && items.length ? String(items.length) : null, banner }
  } catch {
    return { items: [], cursor: null }
  }
}

const chapterCache = new Map<string, Promise<VideoChapter[]>>()

/** A video's chapters, read from its watch page (kept for the session; videos rarely change them). */
export function youtubeChapters(id: string): Promise<VideoChapter[]> {
  let result = chapterCache.get(id)
  if (!result) {
    result = getText('youtube', `https://www.youtube.com/watch?v=${id}&hl=en`).then(parseYouTubeChapters)
    result.catch(() => chapterCache.delete(id))
    chapterCache.set(id, result)
  }
  return result
}
