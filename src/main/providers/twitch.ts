import { channelKey, type Channel, type ChannelAbout, type ChannelPageData, type TogetherChannel, type LiveInfo, type MediaItem } from '@shared/types'
import { parseCount } from '@shared/urls'
import { readPage, type Slot } from '../hidden'
import { getJson, sessionFor } from '../net'
import { store } from '../store'
import {
  parseTimeAgo,
  parseTwitchAbout,
  parseTwitchMedia,
  parseTwitchTogether,
  twitchMentions,
  type TwitchAboutResponse,
  type TwitchMediaResponse,
  type TwitchTogetherResponse
} from './parsers'
import {
  twitchFollowingChannels,
  twitchFollowingLive,
  twitchMedia,
  type ScrapedMedia,
  type ScrapedTwitchChannel,
  type ScrapedTwitchStream
} from './pageScripts'
import { loginWindow, type Provider } from './types'

// You sign in on twitch.tv itself; follows and live status are read from your "Following" pages.

const script = (fn: () => unknown): string => `(${fn.toString()})()`

interface TwitchPublicLiveResponse {
  data?: {
    users?: Array<{
      login: string
      broadcastSettings?: { title?: string } | null
      stream?: { viewersCount?: number; createdAt?: string; game?: { name?: string } | null } | null
    } | null>
  }
}

async function cookie(name: string): Promise<string | undefined> {
  const [c] = await sessionFor('twitch').cookies.get({ url: 'https://www.twitch.tv', name })
  return c?.value ? decodeURIComponent(c.value) : undefined
}

const toChannel = (c: ScrapedTwitchChannel, known?: Channel): Channel => ({
  key: channelKey('twitch', c.login),
  platform: 'twitch',
  id: c.login,
  displayName: c.displayName || known?.displayName || c.login,
  avatarUrl: c.avatarUrl || known?.avatarUrl
})

export const twitch: Provider = {
  platform: 'twitch',
  liveIntervalMs: 2 * 60_000,
  isConnected: () => Boolean(store.get('usernames').twitch),
  username: () => store.get('usernames').twitch,

  async login() {
    await loginWindow('twitch', 'https://www.twitch.tv/login', async () => Boolean(await cookie('auth-token')))
    store.set('usernames', { ...store.get('usernames'), twitch: (await cookie('login')) || 'Signed in' })
  },

  async logout() {
    const { twitch: _, ...rest } = store.get('usernames')
    store.set('usernames', rest)
    await sessionFor('twitch').clearStorageData()
  },

  async getFollows() {
    // The page script reads the full list (see twitchFollowingChannels); with a long list it can take a while.
    const { channels: scraped, complete } = await readPage<{ channels: ScrapedTwitchChannel[]; complete: boolean }>(
      'twitch',
      'follows',
      'https://www.twitch.tv/directory/following/channels',
      script(twitchFollowingChannels),
      120_000
    )
    const stored = store.get('follows').twitch ?? []
    const known = new Map(stored.map((c) => [c.id, c]))
    const read = scraped.map((c) => toChannel(c, known.get(c.login)))
    if (complete) return read
    // Nothing at all: the page didn't load (or Twitch put a check in front of it). An error, so the
    // account shows it and the read is retried later, rather than a silent, empty follow list.
    if (read.length === 0) throw new Error("Twitch's Following page didn't load — try Sync again, or reconnect Twitch")
    // Twitch didn't let the whole list be read: keep the channels already known rather than
    // dropping every follow that wasn't in the part that loaded.
    const seen = new Set(read.map((c) => c.id))
    const kept = stored.filter((c) => !seen.has(c.id))
    console.log(`[twitch] read ${read.length} follows (Twitch didn't allow the full list); kept ${kept.length} already known`)
    return [...read, ...kept]
  },

  async getLive(channels) {
    // Fast path: Twitch's public API for the channels you follow (a fraction of a second, no page);
    // the Following page (several seconds in a hidden window) when it doesn't answer.
    if (channels.length) {
      try {
        return await publicLive(channels)
      } catch (e) {
        console.error('[twitch] live status API, reading the Following page instead:', (e as Error).message)
      }
    }
    const scraped = await readPage<ScrapedTwitchStream[]>(
      'twitch',
      'live',
      'https://www.twitch.tv/directory/following/live',
      script(twitchFollowingLive)
    )
    return scraped.map(
      (s): LiveInfo => ({
        key: channelKey('twitch', s.login),
        title: s.title || '',
        viewers: parseCount(s.viewers),
        category: s.category,
        // Twitch serves live previews at a predictable URL; the timestamp avoids a stale cached frame.
        thumbnail: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${s.login}-640x360.jpg?t=${Math.floor(Date.now() / 60_000)}`
      })
    )
  },

  getLiveSignedOut: (channels) => publicLive(channels),

  async getChannelPage(ch, opts) {
    // Twitch's API gives the first page of past broadcasts and clips in a fraction of a second;
    // reading the channel's pages in a hidden window takes several seconds, so it's the fallback.
    try {
      const page = await channelPageFromApi(ch)
      if (page) return page
    } catch (e) {
      console.error(`[twitch] channel page API for ${ch.id}, reading its pages instead:`, (e as Error).message)
    }
    const bg = opts?.background ?? false
    const [streams, clips] = await Promise.all([readMedia(ch, 'videos', PAGE_SIZE, bg), readMedia(ch, 'clips', PAGE_SIZE, bg)])
    return {
      streams,
      videos: [],
      clips,
      cursors: { streams: cursorAfter(streams), videos: null, clips: cursorAfter(clips) },
      hasVideos: false,
      clipsLabel: 'Clips'
    } satisfies ChannelPageData
  },

  async loadMore(ch, category, cursor) {
    if (category === 'videos') return { items: [], cursor: null }
    // Twitch pages scroll rather than page: re-read with a larger target and return what's new.
    const loaded = Number(cursor) || 0
    const all = await readMedia(ch, category === 'streams' ? 'videos' : 'clips', loaded + PAGE_SIZE)
    const items = all.slice(loaded)
    return { items, cursor: items.length ? cursorAfter(all) : null }
  },

  async getAbout(ch): Promise<ChannelAbout> {
    // The About page's bio, social links and panels, from the same GraphQL API twitch.tv uses.
    const query = `query($login: String!) { user(login: $login) {
      description
      panels { type ... on DefaultPanel { title description imageURL linkURL } }
      channel { socialMedias { name title url } }
    } }`
    const res = await getJson<TwitchAboutResponse>('twitch', 'https://gql.twitch.tv/gql', {
      method: 'POST',
      // twitch.tv's own public web client id (not a developer key).
      headers: { 'Client-Id': TWITCH_WEB_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { login: ch.id } })
    })
    return parseTwitchAbout(res)
  },

  async getTogether(ch, live): Promise<TogetherChannel[]> {
    const mentions = twitchMentions(live?.title).filter((m) => m !== ch.id).slice(0, 10)
    const token = await cookie('auth-token')
    const headers = { 'Client-Id': TWITCH_WEB_CLIENT_ID, 'Content-Type': 'application/json', ...(token ? { Authorization: `OAuth ${token}` } : {}) }
    const gql = <T>(query: string): Promise<T> => getJson<T>('twitch', 'https://gql.twitch.tv/gql', { method: 'POST', headers, body: JSON.stringify({ query }) })
    const user = 'login displayName profileImageURL(width: 70) stream { id }'
    // Stream Together shows up on the stream itself (Twitch calls it costreaming).
    const me = await gql<{ data?: { user?: { id?: string; stream?: { costreamDetails?: NonNullable<TwitchTogetherResponse['data']>['costream'] } | null } | null } }>(
      `{ user(login: ${JSON.stringify(ch.id)}) { id stream { costreamDetails { organizer { ${user} } topCostreamers { ${user} } } } } }`
    )
    const id = me.data?.user?.id
    const parts = [
      ...(id ? [`sharedChat: sharedChatSession(channelID: ${JSON.stringify(id)}) { participants { channel { owner { ${user} } } } }`] : []),
      ...mentions.map((m, i) => `mention${i}: user(login: ${JSON.stringify(m)}) { ${user} }`)
    ]
    const res: TwitchTogetherResponse = parts.length ? await gql<TwitchTogetherResponse>(`{ ${parts.join(' ')} }`) : {}
    res.data = { ...res.data, costream: me.data?.user?.stream?.costreamDetails ?? null }
    // Guest star sessions need the signed-in user, and are asked separately so an error there
    // doesn't lose the rest.
    if (id && token) {
      const guest = await gql<TwitchTogetherResponse>(
        `{ guestStar: guestStarSession(options: { channelID: ${JSON.stringify(id)} }) { host { ${user} } guests { user { ${user} } } } }`
      ).catch(() => undefined)
      if (guest?.data?.guestStar) res.data = { ...res.data, guestStar: guest.data.guestStar }
    }
    return parseTwitchTogether(ch.id, res)
  }
}


const TWITCH_WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'

const PAGE_SIZE = 24
/**
 * Items per list in the API's first (and only integrity-free) page; Twitch keeps past broadcasts
 * for 7–60 days, so that's usually all of them. "Load more" reads the channel's pages.
 */
const API_PAGE_SIZE = 100

/**
 * The clip lists asked for (see parseTwitchMedia). Twitch can't list clips by date, and each list is
 * a capped (100), slightly varying sample of a period's clips, so recent periods are asked for in all
 * three orders it offers; together they cover a day's clips fully except on very busy channels.
 */
const CLIP_LISTS: Array<[string, string]> = [
  ['clipsDay', 'period: LAST_DAY, sort: VIEWS_DESC'],
  ['clipsDayTrending', 'period: LAST_DAY, sort: TRENDING'],
  ['clipsDayDefault', 'period: LAST_DAY'],
  ['clipsWeek', 'period: LAST_WEEK, sort: VIEWS_DESC'],
  ['clipsWeekTrending', 'period: LAST_WEEK, sort: TRENDING'],
  ['clipsWeekDefault', 'period: LAST_WEEK'],
  ['clipsMonth', 'period: LAST_MONTH, sort: VIEWS_DESC'],
  ['clipsMonthTrending', 'period: LAST_MONTH, sort: TRENDING'],
  ['clipsAll', 'period: ALL_TIME, sort: VIEWS_DESC']
]

async function channelPageFromApi(ch: Channel): Promise<ChannelPageData | null> {
  const query = `{ user(login: ${JSON.stringify(ch.id)}) {
    videos(first: ${API_PAGE_SIZE}, type: ARCHIVE, sort: TIME) {
      edges { node { id title lengthSeconds viewCount publishedAt previewThumbnailURL(width: 320, height: 180) } }
      pageInfo { hasNextPage }
    }
    ${CLIP_LISTS.map(
      ([alias, criteria]) => `${alias}: clips(first: ${API_PAGE_SIZE}, criteria: { ${criteria} }) {
      edges { node { slug title durationSeconds viewCount createdAt thumbnailURL } }
      pageInfo { hasNextPage }
    }`
    ).join('\n    ')}
  } }`
  const ask = (): Promise<TwitchMediaResponse & { errors?: unknown[] }> =>
    getJson('twitch', 'https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: { 'Client-Id': TWITCH_WEB_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    })
  // Single lists fail now and then ("service error") while the rest come back; ask once more.
  let res = await ask()
  if (res.errors?.length) res = await ask().catch(() => res)
  const media = parseTwitchMedia(res)
  if (!media) return null
  return {
    streams: media.streams,
    videos: [],
    clips: media.clips,
    // A cursor is how far into the channel's own list (newest past broadcasts; top clips of all
    // time) the API got; loadMore reads that list past it.
    cursors: { streams: media.moreStreams ? String(media.streams.length) : null, videos: null, clips: media.moreClips ? String(media.allTimeClips) : null },
    hasVideos: false,
    clipsLabel: 'Clips'
  }
}
const cursorAfter = (items: MediaItem[]): string | null => (items.length >= PAGE_SIZE ? String(items.length) : null)

async function readMedia(ch: Channel, kind: 'videos' | 'clips', target: number, background = false): Promise<MediaItem[]> {
  const slot: Slot = background ? `bg-${kind}` : kind
  const url =
    kind === 'videos'
      ? `https://www.twitch.tv/${ch.id}/videos?filter=archives&sort=time`
      : `https://www.twitch.tv/${ch.id}/clips?filter=clips&range=all`
  const scraped = await readPage<ScrapedMedia[]>('twitch', slot, url, `(${twitchMedia.toString()})(${JSON.stringify(kind)}, ${target})`, 60_000)
  // The page may render more than asked for; return exactly one batch so "Load more" pages evenly.
  return scraped.slice(0, target).map(
    (m): MediaItem => ({
      ...m,
      kind: kind === 'videos' ? 'vod' : 'clip',
      title: m.title || (kind === 'videos' ? 'Past broadcast' : 'Clip'),
      publishedAt: parseTimeAgo(m.publishedText),
      playUrl:
        kind === 'videos'
          ? `https://player.twitch.tv/?video=v${m.id}&parent=twitch.tv&player=popout&autoplay=true`
          : `https://clips.twitch.tv/embed?clip=${m.id}&parent=twitch.tv&autoplay=true`
    })
  )
}

/** Live status of these channels from Twitch's public GraphQL API: batches of 35 logins, all at once. */
async function publicLive(channels: Channel[]): Promise<LiveInfo[]> {
  const batches: Channel[][] = []
  for (let i = 0; i < channels.length; i += 35) batches.push(channels.slice(i, i + 35))
  const answers = await Promise.all(
    batches.map((batch) =>
      getJson<TwitchPublicLiveResponse>('twitch', 'https://gql.twitch.tv/gql', {
        method: 'POST',
        headers: { 'Client-Id': TWITCH_WEB_CLIENT_ID, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `{ users(logins: ${JSON.stringify(batch.map((c) => c.id))}) { login broadcastSettings { title } stream { viewersCount createdAt game { name } } } }` })
      })
    )
  )
  return answers.flatMap((res) => {
    if (!res.data) throw new Error('no data from Twitch')
    return (res.data.users ?? []).flatMap((u): LiveInfo[] =>
      u?.stream
        ? [
            {
              key: channelKey('twitch', u.login),
              title: u.broadcastSettings?.title || '',
              viewers: u.stream.viewersCount,
              category: u.stream.game?.name || undefined,
              startedAt: u.stream.createdAt,
              thumbnail: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${u.login}-640x360.jpg?t=${Math.floor(Date.now() / 60_000)}`
            }
          ]
        : []
    )
  })
}
