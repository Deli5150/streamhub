import { channelKey, type Channel, type ChannelAbout, type ChannelPageData, type LiveInfo, type MediaItem } from '@shared/types'
import { rumbleEmbedId } from '@shared/urls'
import { getText, mapLimit, sessionFor } from '../net'
import { store } from '../store'
import { parseRumbleDescription, parseRumbleGrid, parseRumbleMenu, parseRumbleVideoPage, type RumbleMenuChannel } from './parsers'
import { loginWindow, type Provider } from './types'

// Rumble has no public API. Every rumble.com page renders a navigation menu that, when signed in,
// lists followed channels with live state — that's the source for follows and live status.

/** Items per page of a Rumble channel's /livestreams and /videos grids. */
const GRID_PAGE_SIZE = 25

const MENU_PAGES = ['https://rumble.com/subscriptions', 'https://rumble.com/browse', 'https://rumble.com/']

async function fetchMenu(): Promise<RumbleMenuChannel[]> {
  let lastErr: unknown
  for (const url of MENU_PAGES) {
    try {
      const html = await getText('rumble', url)
      if (html.includes('main-menu-item-channel')) return parseRumbleMenu(html)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr ?? new Error('rumble: could not read following list')
}

/** Live menu entries link to the stream, not the channel — resolve once per stream and cache. */
const videoCache = new Map<string, ReturnType<typeof parseRumbleVideoPage>>()
async function videoInfo(path: string): Promise<ReturnType<typeof parseRumbleVideoPage>> {
  const hit = videoCache.get(path)
  if (hit) return hit
  const info = parseRumbleVideoPage(await getText('rumble', `https://rumble.com${path}`))
  videoCache.set(path, info)
  return info
}

async function hasSessionCookie(): Promise<boolean> {
  const cookies = await sessionFor('rumble').cookies.get({ domain: 'rumble.com' })
  return cookies.some((c) => c.name === 'u_s' || c.name === 'a_s' || /sess/i.test(c.name))
}

// A follows sync is immediately followed by a live poll; share one read between them.
let recent: { at: number; result: Promise<{ channels: Channel[]; live: LiveInfo[] }> } | null = null
function resolveMenu(): Promise<{ channels: Channel[]; live: LiveInfo[] }> {
  if (recent && Date.now() - recent.at < 10_000) return recent.result
  const result = resolveMenuUncached()
  recent = { at: Date.now(), result }
  result.catch(() => (recent = null))
  return result
}

async function resolveMenuUncached(): Promise<{ channels: Channel[]; live: LiveInfo[] }> {
  const entries = await fetchMenu()
  const channels: Channel[] = []
  const live: LiveInfo[] = []
  await mapLimit(entries, 4, async (e) => {
    let id = e.id
    let info: Awaited<ReturnType<typeof videoInfo>> | undefined
    if (e.live) {
      info = await videoInfo(e.live.videoPath).catch(() => undefined)
      id ??= info?.channelId
    }
    if (!id) return
    const key = channelKey('rumble', id)
    channels.push({ key, platform: 'rumble', id, displayName: e.displayName, avatarUrl: e.avatarUrl })
    if (e.live && info?.numericId) {
      live.push({
        key,
        title: info.title || e.displayName,
        viewers: e.live.viewers,
        thumbnail: info.thumbnail,
        streamId: rumbleEmbedId(info.numericId),
        chatId: info.numericId,
        pageUrl: new URL(e.live.videoPath, 'https://rumble.com').href
      })
    }
  })
  return { channels, live }
}

export const rumble: Provider = {
  platform: 'rumble',
  liveIntervalMs: 2 * 60_000,
  isConnected: () => Boolean(store.get('usernames').rumble),
  username: () => store.get('usernames').rumble,

  async login() {
    await loginWindow('rumble', 'https://rumble.com/login.php', hasSessionCookie)
    store.set('usernames', { ...store.get('usernames'), rumble: 'Signed in' })
  },

  async logout() {
    const { rumble: _, ...rest } = store.get('usernames')
    store.set('usernames', rest)
    await sessionFor('rumble').clearStorageData()
  },

  async getFollows() {
    return (await resolveMenu()).channels
  },

  async getLive() {
    return (await resolveMenu()).live
  },

  async getChannelPage(ch) {
    // Past streams and uploads live on separate tabs, each paged with ?page=N.
    const [streams, videos] = await Promise.all([readGrid(ch, 'streams', 1), readGrid(ch, 'videos', 1)])
    return {
      streams: streams.items,
      videos: videos.items,
      clips: [],
      cursors: { streams: streams.cursor, videos: videos.cursor, clips: null },
      hasVideos: true,
      clipsLabel: null
    } satisfies ChannelPageData
  },

  async loadMore(ch, category, cursor) {
    if (category === 'clips') return { items: [], cursor: null }
    return readGrid(ch, category, Math.max(2, Number(cursor) || 2))
  },

  async getAbout(_ch, live): Promise<ChannelAbout> {
    if (!live?.pageUrl) return { kind: 'description', links: [], panels: [] }
    return parseRumbleDescription(await getText('rumble', live.pageUrl))
  }
}

/** One page of a channel's /livestreams (past streams) or /videos (uploads) grid. */
async function readGrid(ch: Channel, category: 'streams' | 'videos', page: number): Promise<{ items: MediaItem[]; cursor: string | null }> {
  const tab = category === 'streams' ? 'livestreams' : 'videos'
  const html = await getText('rumble', `https://rumble.com/${ch.id}/${tab}${page > 1 ? `?page=${page}` : ''}`).catch(() => '')
  const grid = parseRumbleGrid(html)
  const items = category === 'streams' ? grid.streams : grid.videos
  return { items, cursor: grid.count >= GRID_PAGE_SIZE ? String(page + 1) : null }
}
