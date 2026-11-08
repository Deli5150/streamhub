import type { Channel, ChannelAbout, ChannelPageData, LiveInfo, MediaCategory, MediaItem, VideoChapter } from '@shared/types'
import { readPage } from '../hidden'
import { googleGet, googleSignedIn, googleSignIn, googleSignOut } from '../googleAuth'
import { getJson, getText, mapLimit } from '../net'
import { store } from '../store'
import {
  extractYtInitialData,
  parseTimeAgo,
  parseYouTubeChapters,
  parseYouTubeBanner,
  parseYouTubeDescription,
  parseYouTubeResolve,
  parseYouTubeSubscriptions,
  parseYouTubeVideoStatuses,
  youTubeSelectedTabUrl,
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
    // Which channels' /live page leads to a video (public, no quota).
    const found = await mapLimit(channels, 8, (c) => resolveLive(c))
    // Which of those videos are live now (vs. scheduled): up to 50 per API call.
    const ids = [...new Set(found.filter((id): id is string => Boolean(id)))]
    const live: LiveInfo[] = []
    for (let i = 0; i < ids.length; i += 50) {
      const res = await googleGet<YouTubeVideosResponse>(`${API}/videos?part=snippet,liveStreamingDetails&maxResults=50&id=${ids.slice(i, i + 50).join(',')}`)
      live.push(...parseYouTubeVideoStatuses(res).live)
    }
    // One entry per channel (a channel can run two streams at once; keep the bigger one).
    const known = new Set(channels.map((c) => c.key))
    const byKey = new Map<string, LiveInfo>()
    for (const l of live) if (known.has(l.key) && (byKey.get(l.key)?.viewers ?? -1) < (l.viewers ?? 0)) byKey.set(l.key, l)
    return [...byKey.values()]
  },

  async getLiveSignedOut(channels) {
    // The same public resolver, then YouTube's player endpoint (public too) for whether it's live now.
    const found = await mapLimit(channels, 8, async (c): Promise<LiveInfo | null> => {
      const id = await resolveLive(c)
      if (!id) return null
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
    })
    return found.filter((l): l is LiveInfo => Boolean(l))
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
