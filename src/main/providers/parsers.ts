// Pure parsers for scraped / unofficial responses. Kept free of Electron imports so they can be unit tested.
import * as cheerio from 'cheerio'
import { channelKey, type AboutPanel, type Channel, type ChannelAbout, type LiveInfo, type MediaItem, type TogetherChannel, type VideoChapter } from '@shared/types'
import { parseCount, rumbleEmbedId } from '@shared/urls'

// ---------- YouTube RSS ----------

export interface RssEntry {
  videoId: string
  title: string
  published: string
  thumbnail?: string
}

export function parseYouTubeRss(xml: string): RssEntry[] {
  const $ = cheerio.load(xml, { xml: true })
  return $('entry')
    .toArray()
    .map((el) => {
      const e = $(el)
      return {
        videoId: e.find('yt\\:videoId').text(),
        title: e.find('title').first().text(),
        published: e.find('published').text(),
        thumbnail: e.find('media\\:thumbnail').attr('url')
      }
    })
    .filter((e) => e.videoId)
}

// ---------- Kick ----------

export interface KickFollowedResponse {
  nextCursor?: number | null
  channels?: Array<{
    channel_slug: string
    user_username?: string
    profile_picture?: string | null
    is_live?: boolean
    viewer_count?: number
    session_title?: string
    category_name?: string
  }>
}

export function parseKickFollowed(res: KickFollowedResponse): { channels: Channel[]; live: LiveInfo[] } {
  const channels: Channel[] = []
  const live: LiveInfo[] = []
  for (const c of res.channels ?? []) {
    const key = channelKey('kick', c.channel_slug)
    channels.push({
      key,
      platform: 'kick',
      id: c.channel_slug,
      displayName: c.user_username || c.channel_slug,
      avatarUrl: c.profile_picture || undefined
    })
    if (c.is_live)
      live.push({ key, title: c.session_title || '', viewers: c.viewer_count, category: c.category_name })
  }
  return { channels, live }
}

/**
 * `/api/v2/channels/{slug}/livestream` → live details. Unlike the channel endpoint (whose
 * `stream.kick.com` thumbnail is often null or 403s), this has a working `images.kick.com` thumbnail.
 */
export interface KickLivestreamResponse {
  data: {
    session_title?: string
    created_at?: string
    viewers?: number
    category?: { name?: string } | null
    thumbnail?: { src?: string } | null
  } | null
}

export function parseKickLivestream(res: KickLivestreamResponse, slug: string): LiveInfo | undefined {
  const d = res.data
  if (!d) return undefined
  return {
    key: channelKey('kick', slug),
    title: d.session_title || '',
    viewers: d.viewers,
    thumbnail: d.thumbnail?.src || undefined,
    category: d.category?.name || undefined,
    startedAt: d.created_at && !/[zZ+]/.test(d.created_at) ? d.created_at.replace(' ', 'T') + 'Z' : d.created_at
  }
}

// ---------- Rumble ----------

/** Rumble avatars are CSS classes (`user-image--img--id-<hash>`) defined in inline <style> blocks. */
function rumbleAvatarMap(html: string): Map<string, string> {
  const map = new Map<string, string>()
  const re = /\.user-image--img--id-([a-z0-9]+)\s*\{[^}]*?background-image:\s*url\(([^)]+)\)/g
  for (const m of html.matchAll(re)) map.set(m[1], m[2].replace(/["']/g, ''))
  return map
}

export interface RumbleMenuChannel {
  displayName: string
  /** "c/Name" for offline entries; live entries link to the stream instead */
  id?: string
  avatarUrl?: string
  live?: { videoPath: string; viewers?: number }
}

/**
 * Parses the left navigation menu that Rumble renders on every page. When signed in, it includes
 * a "Following"/"Subscriptions" section listing every followed channel with live state.
 */
export function parseRumbleMenu(html: string): RumbleMenuChannel[] {
  const $ = cheerio.load(html)
  const avatars = rumbleAvatarMap(html)
  const out: RumbleMenuChannel[] = []
  let inFollowing = false
  $('.main-menu-heading, a.main-menu-item-channel').each((_, el) => {
    const node = $(el)
    if (node.hasClass('main-menu-heading')) {
      inFollowing = /follow|subscri/i.test(node.text())
      return
    }
    if (!inFollowing) return
    const href = node.attr('href') || ''
    const avatarClass = (node.find('i.user-image').attr('class') || '').match(/user-image--img--id-([a-z0-9]+)/)
    const entry: RumbleMenuChannel = {
      displayName: (node.attr('title') || node.find('.main-menu-item-channel-label').text()).trim(),
      avatarUrl: avatarClass ? avatars.get(avatarClass[1]) : undefined
    }
    const path = href.split('?')[0].replace(/^\//, '').toLowerCase()
    if (/^(c|user)\/[^/]+$/.test(path)) entry.id = path
    if (node.hasClass('main-menu-item-channel-is-live')) {
      const viewers = node.find('[data-live-viewers]').attr('data-live-viewers')
      entry.live = { videoPath: href.split('?')[0], viewers: parseCount(viewers) }
    }
    if (entry.displayName) out.push(entry)
  })
  return out
}

/** Video watch page → ids needed for the player and chat, plus the channel it belongs to. */
export function parseRumbleVideoPage(html: string): { numericId?: string; channelId?: string; title?: string; thumbnail?: string } {
  const $ = cheerio.load(html)
  const numericId = html.match(/data-video-id="(\d+)"/)?.[1] ?? html.match(/"video_id":(\d+)/)?.[1]
  const channelHref = $('a.media-by--a[href], a.media-heading-name[href]').first().attr('href')
  const channelId = channelHref?.split('?')[0].replace(/^\//, '').toLowerCase()
  // The JSON-LD VideoObject carries the preview image (pages have no og:image).
  const thumbnail = html.match(/"thumbnailUrl":"(https:[^"]+)"/)?.[1]?.replace(/\\\//g, '/') ?? $('meta[property="og:image"]').attr('content')
  return { numericId, channelId, title: $('meta[property="og:title"]').attr('content') || $('title').first().text().trim(), thumbnail }
}

// ---------- YouTube signed-in pages ----------

/** Pulls the `ytInitialData` JSON that YouTube embeds in every page. */
export function extractYtInitialData(html: string): unknown {
  const start = html.search(/(?:var |window\["|window\.)ytInitialData"?\]?\s*=\s*\{/)
  if (start < 0) return undefined
  const open = html.indexOf('{', start)
  // Walk to the matching brace, respecting strings, so we don't depend on what follows the object.
  let depth = 0
  let inStr = false
  for (let i = open; i < html.length; i++) {
    const ch = html[i]
    if (inStr) {
      if (ch === '\\') i++
      else if (ch === '"') inStr = false
    } else if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return JSON.parse(html.slice(open, i + 1))
  }
  return undefined
}

/** True when YouTube rendered the page for a signed-out visitor. */
export const youTubeSignedOut = (html: string): boolean => /"LOGGED_IN":false/.test(html)

const VIDEO_RENDERERS = new Set(['videoRenderer', 'gridVideoRenderer', 'compactVideoRenderer', 'lockupViewModel'])

/**
 * Finds live streams in a YouTube page's initial data (used on /feed/subscriptions). Handles both the
 * classic `videoRenderer` and the newer `lockupViewModel` shapes by inspecting each item's JSON.
 */
export function parseYouTubeLive(data: unknown): Array<Omit<LiveInfo, 'key'> & { channelId: string }> {
  const out = new Map<string, Omit<LiveInfo, 'key'> & { channelId: string }>()
  const textOf = (t: unknown): string | undefined => {
    const o = t as { simpleText?: string; runs?: Array<{ text: string }>; content?: string } | undefined
    return o?.simpleText ?? o?.runs?.map((r) => r.text).join('') ?? o?.content
  }
  const visit = (node: unknown, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > 60) return
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1))
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (VIDEO_RENDERERS.has(k) && v && typeof v === 'object') {
        const item = v as Record<string, unknown>
        const json = JSON.stringify(item)
        const isLive =
          /BADGE_STYLE_TYPE_LIVE_NOW|THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE|"style":"LIVE"/.test(json) && !/"UPCOMING"|STYLE_UPCOMING/.test(json)
        const videoId = (item.videoId ?? item.contentId) as string | undefined
        const channelId = json.match(/"browseId":"(UC[\w-]{22})"/)?.[1]
        if (isLive && videoId && channelId && !out.has(channelId)) {
          const meta = (item.metadata as { lockupMetadataViewModel?: { title?: unknown } } | undefined)?.lockupMetadataViewModel
          // Either "1.2K watching" or split into runs: [{"text":"18,109"},{"text":" watching"}]
          const watching = json.match(/"([\d.,]+\s*[KkMm]?)(?:\s+|"\},\{"text":"\s*)watching/)?.[1]
          out.set(channelId, {
            channelId,
            title: textOf(item.title) ?? textOf(meta?.title) ?? '',
            viewers: parseCount(watching),
            thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
            streamId: videoId
          })
        }
        continue
      }
      visit(v, depth + 1)
    }
  }
  visit(data, 0)
  return [...out.values()]
}

// ---------- Channel pages (past streams, uploads, clips) ----------

export function formatDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

export function formatViews(n: number): string {
  const short = n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : String(n)
  return `${short} ${n === 1 ? 'view' : 'views'}`
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000)
  const units: Array<[number, string]> = [
    [31536000, 'year'],
    [2592000, 'month'],
    [604800, 'week'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute']
  ]
  for (const [secs, name] of units) {
    const n = Math.floor(s / secs)
    if (n >= 1) return `${n} ${name}${n === 1 ? '' : 's'} ago`
  }
  return 'just now'
}

/**
 * "3 days ago" / "Streamed 2 weeks ago" / YouTube's short "4y ago", "10mo ago" / "Yesterday" → an
 * approximate ISO date (for sorting and filtering clips).
 */
export function parseTimeAgo(text: string | undefined, now = Date.now()): string | undefined {
  if (!text) return undefined
  if (/yesterday/i.test(text)) return new Date(now - 86400_000).toISOString()
  const m = text.match(/(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?|[smhdwy])\s+ago/i)
  if (!m) return undefined
  const unit = m[2].toLowerCase()
  const secs =
    unit.startsWith('mo') ? 2592000
    : unit.startsWith('mi') || unit === 'm' ? 60
    : unit.startsWith('s') ? 1
    : unit.startsWith('h') ? 3600
    : unit.startsWith('d') ? 86400
    : unit.startsWith('w') ? 604800
    : 31536000
  return new Date(now - Number(m[1]) * secs * 1000).toISOString()
}

/** Normalizes Kick's "2026-10-26 20:59:33" (UTC, no zone) and ISO strings. */
const kickDate = (d: string | undefined): string | undefined => (d && !/[zZ+]/.test(d) ? d.replace(' ', 'T') + 'Z' : d)

export interface KickVideoItem {
  is_live?: boolean
  session_title?: string
  created_at?: string
  /** milliseconds */
  duration?: number
  views?: number
  source?: string
  thumbnail?: { src?: string } | null
  video?: { uuid?: string; views?: number; created_at?: string } | null
}

/** `/api/v2/channels/{slug}/videos` → finished past streams (played from their HLS source). */
export function parseKickVideos(items: KickVideoItem[]): MediaItem[] {
  return items
    .filter((v) => !v.is_live && v.video?.uuid && v.source)
    .map((v) => {
      const at = kickDate(v.video?.created_at ?? v.created_at)
      const views = v.video?.views ?? v.views
      return {
        id: v.video!.uuid!,
        kind: 'vod' as const,
        title: v.session_title || 'Past broadcast',
        thumbnail: v.thumbnail?.src || undefined,
        durationText: v.duration ? formatDuration(v.duration / 1000) : undefined,
        viewCountText: views !== undefined ? formatViews(views) : undefined,
        publishedAt: at,
        publishedText: at ? timeAgo(at) : undefined,
        hlsUrl: v.source
      }
    })
}

export interface KickClipsResponse {
  clips?: Array<{
    id: string
    title?: string
    thumbnail_url?: string
    video_url?: string
    clip_url?: string
    /** seconds */
    duration?: number
    views?: number
    view_count?: number
    created_at?: string
  }>
  nextCursor?: unknown
}

/** `/api/v2/channels/{slug}/clips` → clips plus the cursor for the next page. */
export function parseKickClips(res: KickClipsResponse): { items: MediaItem[]; cursor: string | null } {
  const items = (res.clips ?? [])
    .filter((c) => c.video_url || c.clip_url)
    .map((c) => {
      const views = c.views ?? c.view_count
      return {
        id: c.id,
        kind: 'clip' as const,
        title: c.title || 'Clip',
        thumbnail: c.thumbnail_url,
        durationText: c.duration ? formatDuration(c.duration) : undefined,
        viewCountText: views !== undefined ? formatViews(views) : undefined,
        publishedAt: c.created_at,
        publishedText: c.created_at ? timeAgo(c.created_at) : undefined,
        hlsUrl: c.video_url || c.clip_url
      }
    })
  const next = res.nextCursor
  const cursor = next == null ? null : typeof next === 'string' ? next : JSON.stringify(next)
  return { items, cursor: items.length ? cursor : null }
}

interface RumbleGridItem {
  object_type?: string
  id?: number
  title?: string
  thumb?: string
  /** seconds */
  duration?: number
  views?: number
  upload_date?: string
  live_streamed_on?: string | null
  live?: boolean
}

/**
 * The `<rum-videos-grid>` JSON on a Rumble channel's /videos page → finished past streams
 * (originally livestreamed) and regular uploads. `count` is the raw number of grid items, used to
 * tell when paging has run out.
 */
export function parseRumbleGrid(html: string): { streams: MediaItem[]; videos: MediaItem[]; count: number } {
  const m = html.match(/<rum-videos-grid>\s*<script type="application\/json">([\s\S]*?)<\/script>/i)
  const out = { streams: [] as MediaItem[], videos: [] as MediaItem[], count: 0 }
  if (!m) return out
  let items: RumbleGridItem[] = []
  try {
    items = (JSON.parse(m[1]) as { items?: RumbleGridItem[] }).items ?? []
  } catch {
    return out
  }
  out.count = items.length
  for (const it of items) {
    if (it.object_type !== 'video' || it.live || !it.id || !it.title) continue
    const item: MediaItem = {
      id: String(it.id),
      kind: it.live_streamed_on ? 'vod' : 'video',
      title: it.title,
      thumbnail: it.thumb,
      durationText: it.duration ? formatDuration(it.duration) : undefined,
      viewCountText: it.views !== undefined ? formatViews(it.views) : undefined,
      publishedAt: it.live_streamed_on || it.upload_date,
      publishedText: it.upload_date ? timeAgo(it.live_streamed_on || it.upload_date) : undefined,
      playUrl: `https://rumble.com/embed/${rumbleEmbedId(String(it.id))}/?autoplay=2`
    }
    ;(it.live_streamed_on ? out.streams : out.videos).push(item)
  }
  return out
}

/** The channel banner from a YouTube channel page's initial data (newest and classic header shapes). */
export function parseYouTubeBanner(data: unknown): string | undefined {
  let best: { url: string; width: number } | undefined
  const visit = (node: unknown, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > 40 || best) return
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1))
    const o = node as Record<string, any>
    const sources: Array<{ url: string; width?: number }> | undefined =
      o.imageBannerViewModel?.image?.sources ?? o.c4TabbedHeaderRenderer?.banner?.thumbnails
    if (sources?.length) {
      const top = [...sources].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]
      best = { url: top.url.startsWith('//') ? `https:${top.url}` : top.url, width: top.width ?? 0 }
      return
    }
    for (const v of Object.values(o)) visit(v, depth + 1)
  }
  visit(data, 0)
  return best?.url
}

/** URL of the tab YouTube actually served (it serves Home for tabs a channel doesn't have, e.g. Live). */
export function youTubeSelectedTabUrl(data: unknown): string | undefined {
  const tabs = (data as { contents?: { twoColumnBrowseResultsRenderer?: { tabs?: Array<{ tabRenderer?: Record<string, any> }> } } })?.contents
    ?.twoColumnBrowseResultsRenderer?.tabs
  const selected = tabs?.find((t) => t.tabRenderer?.selected)?.tabRenderer
  return selected?.endpoint?.commandMetadata?.webCommandMetadata?.url
}

// ---------- About sections / stream descriptions ----------

/** Twitch GQL `user { description panels channel { socialMedias } }` response. */
export interface TwitchAboutResponse {
  data?: {
    user?: {
      description?: string | null
      panels?: Array<{ type?: string; title?: string | null; description?: string | null; imageURL?: string | null; linkURL?: string | null }> | null
      channel?: { socialMedias?: Array<{ name?: string; title?: string | null; url?: string | null }> | null } | null
    } | null
  }
}

export function parseTwitchAbout(res: TwitchAboutResponse): ChannelAbout {
  const u = res.data?.user
  return {
    kind: 'about',
    text: u?.description?.trim() || undefined,
    links: (u?.channel?.socialMedias ?? [])
      .filter((s) => s.url)
      .map((s) => ({ title: s.title || s.name || hostOf(s.url!), url: s.url! })),
    // Extension panels have no content of their own (they're iframes), so they're skipped.
    panels: (u?.panels ?? [])
      .filter((p) => p.type !== 'EXTENSION')
      .map((p) => compactPanel({ title: p.title, text: p.description, imageUrl: p.imageURL, linkUrl: p.linkURL }))
      .filter(hasContent)
  }
}

/** `/api/v2/channels/{slug}` (bio, socials) and `/api/v2/channels/{slug}/links` (About panels). */
export interface KickChannelResponse {
  user?: { bio?: string | null; instagram?: string; twitter?: string; youtube?: string; discord?: string; tiktok?: string; facebook?: string } | null
}
export type KickLinksResponse = Array<{ title?: string; description?: string; link?: string; image?: { url?: string } | null }>

/** Kick stores socials as handles or paths; these are the sites they belong to. */
const KICK_SOCIALS: Array<[keyof NonNullable<KickChannelResponse['user']>, string, string]> = [
  ['instagram', 'Instagram', 'https://instagram.com/'],
  ['twitter', 'X', 'https://x.com/'],
  ['youtube', 'YouTube', 'https://youtube.com/'],
  ['discord', 'Discord', 'https://discord.gg/'],
  ['tiktok', 'TikTok', 'https://tiktok.com/@'],
  ['facebook', 'Facebook', 'https://facebook.com/']
]

export function parseKickAbout(channel: KickChannelResponse, links: KickLinksResponse): ChannelAbout {
  const u = channel.user
  return {
    kind: 'about',
    text: u?.bio?.trim() || undefined,
    links: KICK_SOCIALS.flatMap(([field, title, base]) => {
      const v = String(u?.[field] ?? '').trim()
      if (!v) return []
      return [{ title, url: /^https?:\/\//.test(v) ? v : base + v.replace(/^@/, '') }]
    }),
    panels: (Array.isArray(links) ? links : [])
      .map((l) => compactPanel({ title: l.title, text: l.description, imageUrl: l.image?.url, linkUrl: l.link }))
      .filter(hasContent)
  }
}

/** The full description from a YouTube watch page (`videoDetails.shortDescription`, which isn't short). */
export function parseYouTubeDescription(html: string): ChannelAbout {
  const m = html.match(/"shortDescription":("(?:[^"\\]|\\.)*")/)
  let text: string | undefined
  try {
    text = m ? (JSON.parse(m[1]) as string).trim() || undefined : undefined
  } catch {
    text = undefined
  }
  return { kind: 'description', text, links: [], panels: [] }
}

/**
 * The description box on a Rumble video page. Its JSON-LD copy is cut at 200 characters, so this
 * reads the `p.media-description` paragraphs, keeping line breaks and each link's address.
 */
export function parseRumbleDescription(html: string): ChannelAbout {
  const $ = cheerio.load(html)
  const paragraphs = $('p.media-description')
    .map((_, el) => {
      const p = $(el).clone()
      p.find('br').replaceWith('\n')
      // Cloudflare hides email addresses behind a script; drop the placeholder rather than show it.
      p.find('a.__cf_email__').remove()
      p.find('a[href]').each((_, a) => {
        const label = $(a).text().trim()
        let href: string
        try {
          href = new URL($(a).attr('href') ?? '', 'https://rumble.com').href
        } catch {
          return void $(a).replaceWith(label)
        }
        // Most links show their own address (sometimes shortened); others get markdown so the address isn't lost.
        const showsAddress = label.length > 0 && href.replace(/\/$/, '').startsWith(label.replace(/…$/, '').replace(/\/$/, ''))
        $(a).replaceWith(showsAddress || !label ? href : `[${label}](${href})`)
      })
      return p.text().trim()
    })
    .get()
    .filter(Boolean)
  return { kind: 'description', text: paragraphs.join('\n\n') || undefined, links: [], panels: [] }
}

function compactPanel(p: { title?: string | null; text?: string | null; imageUrl?: string | null; linkUrl?: string | null }): AboutPanel {
  return {
    title: p.title?.trim() || undefined,
    text: p.text?.trim() || undefined,
    imageUrl: p.imageUrl || undefined,
    linkUrl: p.linkUrl || undefined
  }
}

const hasContent = (p: AboutPanel): boolean => Boolean(p.title || p.text || p.imageUrl)

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// ---------- Twitch Stream Together ----------

/** @handles in a stream title that could be Twitch logins (4–25 letters, digits or underscores). */
export function twitchMentions(title: string | undefined): string[] {
  const out = new Set<string>()
  for (const m of (title ?? '').matchAll(/(?:^|[^\w@])@([A-Za-z0-9_]{4,25})\b/g)) out.add(m[1].toLowerCase())
  return [...out]
}

interface TwitchUserNode {
  login?: string
  displayName?: string
  profileImageURL?: string | null
  stream?: { id?: string } | null
}

/**
 * Stream Together (costream organizer and top costreamers), shared chat participants, guest star
 * host and guests, and @mentioned users.
 */
export interface TwitchTogetherResponse {
  data?: {
    costream?: { organizer?: TwitchUserNode | null; topCostreamers?: Array<TwitchUserNode | null> | null } | null
    sharedChat?: { participants?: Array<{ channel?: { owner?: TwitchUserNode | null } | null }> | null } | null
    guestStar?: { host?: TwitchUserNode | null; guests?: Array<{ user?: TwitchUserNode | null }> | null } | null
  } & Record<string, unknown>
}

/**
 * Channels streaming with `self` (Stream Together, shared chat or guest star) and channels its title @mentions
 * (`mention0`, `mention1`, … aliases), without `self`, each once; streaming together wins over a
 * mention. Mentions that aren't Twitch users are dropped.
 */
export function parseTwitchTogether(self: string, res: TwitchTogetherResponse): TogetherChannel[] {
  const d = res.data ?? {}
  const out = new Map<string, TogetherChannel>()
  const add = (u: TwitchUserNode | null | undefined, reason: TogetherChannel['reason']): void => {
    const login = u?.login?.toLowerCase()
    if (!login || login === self.toLowerCase() || out.has(login)) return
    out.set(login, { platform: 'twitch', login, displayName: u?.displayName || login, avatarUrl: u?.profileImageURL || undefined, live: Boolean(u?.stream?.id), reason })
  }
  add(d.costream?.organizer, 'together')
  for (const u of d.costream?.topCostreamers ?? []) add(u, 'together')
  for (const p of d.sharedChat?.participants ?? []) add(p.channel?.owner, 'together')
  add(d.guestStar?.host, 'together')
  for (const g of d.guestStar?.guests ?? []) add(g.user, 'together')
  for (const [k, v] of Object.entries(d)) if (/^mention\d+$/.test(k)) add(v as TwitchUserNode | null, 'mention')
  return [...out.values()]
}

// ---------- Twitch channel page (past broadcasts and clips) ----------

type TwitchClipConnection = {
  edges?: Array<{ node?: { slug?: string; title?: string | null; durationSeconds?: number; viewCount?: number; createdAt?: string; thumbnailURL?: string } | null }> | null
  pageInfo?: { hasNextPage?: boolean } | null
} | null

/**
 * Twitch GQL `user { videos(type: ARCHIVE) … }` plus clip lists under aliases starting with "clips"
 * (several periods and orders; `clipsAll` is the all-time top), first page of each.
 */
export interface TwitchMediaResponse {
  data?: {
    user?: ({
      videos?: {
        edges?: Array<{ node?: { id?: string; title?: string | null; lengthSeconds?: number; viewCount?: number; publishedAt?: string; previewThumbnailURL?: string } | null }> | null
        pageInfo?: { hasNextPage?: boolean } | null
      } | null
      clipsAll?: TwitchClipConnection
    } & { [clipList: `clips${string}`]: TwitchClipConnection }) | null
  }
}

/**
 * Past broadcasts (newest first) and clips, with whether each has more. Twitch can't list clips by
 * date, only the top (or trending) clips of a period, so recent clips come from those lists for the
 * last day, week and month, merged with the all-time top and sorted newest first. `allTimeClips` is
 * how far into the all-time list that got ("Load more" continues it). A clip list that failed is
 * just skipped. Null when the channel isn't found or its past broadcasts didn't load (the caller
 * then reads the channel's pages instead).
 */
export function parseTwitchMedia(
  res: TwitchMediaResponse
): { streams: MediaItem[]; clips: MediaItem[]; moreStreams: boolean; moreClips: boolean; allTimeClips: number } | null {
  const user = res.data?.user
  if (!user?.videos) return null
  const streams = (user.videos.edges ?? []).flatMap((e): MediaItem[] => {
    const v = e.node
    if (!v?.id) return []
    return [{
      id: v.id,
      kind: 'vod',
      title: v.title || 'Past broadcast',
      thumbnail: v.previewThumbnailURL || undefined,
      durationText: v.lengthSeconds ? formatDuration(v.lengthSeconds) : undefined,
      viewCountText: v.viewCount !== undefined ? formatViews(v.viewCount) : undefined,
      publishedAt: v.publishedAt,
      publishedText: v.publishedAt ? timeAgo(v.publishedAt) : undefined,
      playUrl: `https://player.twitch.tv/?video=v${v.id}&parent=twitch.tv&player=popout&autoplay=true`
    }]
  })
  const clips = new Map<string, MediaItem>()
  const lists = Object.entries(user).filter(([k]) => k.startsWith('clips')).map(([, v]) => v as TwitchClipConnection)
  for (const conn of lists) {
    for (const e of conn?.edges ?? []) {
      const c = e.node
      if (!c?.slug || clips.has(c.slug)) continue
      clips.set(c.slug, {
        id: c.slug,
        kind: 'clip',
        title: c.title || 'Clip',
        thumbnail: c.thumbnailURL || undefined,
        durationText: c.durationSeconds ? formatDuration(c.durationSeconds) : undefined,
        viewCountText: c.viewCount !== undefined ? formatViews(c.viewCount) : undefined,
        publishedAt: c.createdAt,
        publishedText: c.createdAt ? timeAgo(c.createdAt) : undefined,
        playUrl: `https://clips.twitch.tv/embed?clip=${c.slug}&parent=twitch.tv&autoplay=true`
      })
    }
  }
  const newestFirst = [...clips.values()].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
  return {
    streams,
    clips: newestFirst,
    moreStreams: Boolean(user.videos.pageInfo?.hasNextPage),
    // Without the all-time list, "Load more" reads the all-time clips from the start.
    moreClips: user.clipsAll ? Boolean(user.clipsAll.pageInfo?.hasNextPage) : true,
    allTimeClips: user.clipsAll?.edges?.length ?? 0
  }
}

// ---------- YouTube Data API ----------

/** `youtube/v3/subscriptions?part=snippet&mine=true` page. */
export interface YouTubeSubscriptionsResponse {
  nextPageToken?: string
  items?: Array<{
    snippet?: {
      title?: string
      resourceId?: { channelId?: string }
      thumbnails?: Partial<Record<'default' | 'medium' | 'high', { url?: string }>>
    }
  }>
}

export function parseYouTubeSubscriptions(res: YouTubeSubscriptionsResponse): { channels: Channel[]; next: string | null } {
  const channels = (res.items ?? []).flatMap((it): Channel[] => {
    const id = it.snippet?.resourceId?.channelId
    if (!id) return []
    const t = it.snippet?.thumbnails
    return [{ key: channelKey('youtube', id), platform: 'youtube', id, displayName: it.snippet?.title || id, avatarUrl: t?.medium?.url || t?.default?.url || t?.high?.url }]
  })
  return { channels, next: res.nextPageToken || null }
}

/** YouTube's `navigation/resolve_url` answer for youtube.com/channel/<id>/live. */
export interface YouTubeResolveResponse {
  endpoint?: { watchEndpoint?: { videoId?: string }; browseEndpoint?: { browseId?: string } }
}

/** The video a channel's /live page leads to (live or scheduled), or null when it leads to the channel page. */
export const parseYouTubeResolve = (res: YouTubeResolveResponse): string | null => res.endpoint?.watchEndpoint?.videoId || null

/** `youtube/v3/videos?part=snippet,liveStreamingDetails&id=…`. */
export interface YouTubeVideosResponse {
  items?: Array<{
    id?: string
    snippet?: {
      channelId?: string
      title?: string
      liveBroadcastContent?: 'live' | 'upcoming' | 'none' | string
      thumbnails?: Partial<Record<'default' | 'medium' | 'high' | 'standard' | 'maxres', { url?: string }>>
    }
    liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string; concurrentViewers?: string }
  }>
}

/**
 * Each video's broadcast state ('live', 'upcoming' or 'none', which never changes back), and the
 * ones live right now as LiveInfo.
 */
export function parseYouTubeVideoStatuses(res: YouTubeVideosResponse): { status: Map<string, string>; live: LiveInfo[] } {
  const status = new Map<string, string>()
  const live: LiveInfo[] = []
  for (const v of res.items ?? []) {
    if (!v.id) continue
    const ended = Boolean(v.liveStreamingDetails?.actualEndTime)
    const state = ended ? 'none' : v.snippet?.liveBroadcastContent || 'none'
    status.set(v.id, state)
    if (state !== 'live' || !v.snippet?.channelId) continue
    const t = v.snippet.thumbnails
    const viewers = Number(v.liveStreamingDetails?.concurrentViewers)
    live.push({
      key: channelKey('youtube', v.snippet.channelId),
      title: v.snippet.title || '',
      viewers: Number.isFinite(viewers) ? viewers : undefined,
      startedAt: v.liveStreamingDetails?.actualStartTime,
      thumbnail: t?.maxres?.url || t?.high?.url || t?.medium?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault_live.jpg`,
      streamId: v.id
    })
  }
  return { status, live }
}

// ---------- YouTube chapters ----------

/** "1:02:03" / "12:05" → seconds (NaN if not a timestamp). */
const timestampSeconds = (text: string): number =>
  /^\d{1,2}(:\d{2}){1,2}$/.test(text) ? text.split(':').reduce((acc, n) => acc * 60 + Number(n), 0) : NaN

/**
 * A YouTube video's chapters from its watch page: the player bar's chapter markers (creator's or
 * auto-generated), else timestamps listed in the description ("0:00 Intro", the way YouTube itself
 * finds chapters: starting at 0:00, at least three). Empty when the video has none.
 */
export function parseYouTubeChapters(html: string): VideoChapter[] {
  const found = new Map<number, VideoChapter>()
  const walk = (node: unknown, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > 60) return
    if (Array.isArray(node)) {
      for (const n of node) walk(n, depth + 1)
      return
    }
    const o = node as Record<string, unknown>
    const ch = o.chapterRenderer as
      | { title?: { simpleText?: string }; timeRangeStartMillis?: number; thumbnail?: { thumbnails?: Array<{ url?: string }> } }
      | undefined
    if (ch && typeof ch.timeRangeStartMillis === 'number' && ch.title?.simpleText) {
      const start = Math.round(ch.timeRangeStartMillis / 1000)
      if (!found.has(start)) found.set(start, { title: ch.title.simpleText, start, thumbnail: ch.thumbnail?.thumbnails?.at(-1)?.url })
    }
    for (const v of Object.values(o)) walk(v, depth + 1)
  }
  walk(extractYtInitialData(html), 0)
  if (found.size) return [...found.values()].sort((a, b) => a.start - b.start)

  // The description, a JSON string in the player response.
  const m = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)
  if (!m) return []
  let description = ''
  try {
    description = JSON.parse(`"${m[1]}"`) as string
  } catch {
    return []
  }
  const chapters: VideoChapter[] = []
  for (const line of description.split('\n')) {
    const t = line.trim().match(/^(?:[-•▶►]\s*)?\(?(\d{1,2}(?::\d{2}){1,2})\)?\s*[-–—:|]?\s*(.+)$/)
    if (!t) continue
    const start = timestampSeconds(t[1])
    if (Number.isFinite(start) && (!chapters.length || start > chapters[chapters.length - 1].start)) chapters.push({ title: t[2].trim(), start })
  }
  return chapters.length >= 3 && chapters[0].start === 0 ? chapters : []
}
