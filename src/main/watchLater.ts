import { PLATFORMS, type ChannelPageData, type LiveInfo, type MediaItem, type Platform, type SavedItem } from '@shared/types'
import { rumbleEmbedId } from '@shared/urls'
import { store } from './store'

// Watch Later playlist: saved live streams and past videos, in the user's order. A saved live stream
// is swapped for its recording once the stream ends, so the entry stays watchable.

/** How often an offline channel entry re-checks for its stream's recording. */
const RECHECK_MS = 10 * 60_000
/** Past streams published this close to (or after) the live stream's start are that stream's own recording. */
const SAME_STREAM_SLACK_MS = 30 * 60_000
/** Without a start time (Twitch), a recording that runs up to roughly now is the stream in progress. */
const STILL_RECORDING_SLACK_MS = 90 * 60_000

/** "4:32:02" / "12:05" → seconds. */
export function durationSeconds(text?: string): number {
  if (!text || !/^\d+(:\d{1,2}){1,2}$/.test(text.trim())) return NaN
  return text.trim().split(':').reduce((acc, n) => acc * 60 + Number(n), 0)
}

export const savedVodId = (platform: Platform, mediaId: string): string => `vod:${platform}:${mediaId}`
export const savedChannelId = (channelKey: string): string => `channel:${channelKey}`

export const getSaved = (): SavedItem[] => store.get('watchLater') ?? []
const commit = (items: SavedItem[]): void => store.set('watchLater', items)

/** Keeps only well-formed entries from the renderer. */
export function cleanSaved(raw: unknown): Omit<SavedItem, 'savedAt'> | null {
  const i = raw as Partial<SavedItem> | null
  if (!i || typeof i.id !== 'string' || typeof i.channelKey !== 'string' || typeof i.displayName !== 'string') return null
  if (i.kind !== 'channel' && i.kind !== 'vod') return null
  if (!PLATFORMS.includes(i.platform as Platform)) return null
  if (i.kind === 'vod' && (!i.media || typeof i.media.id !== 'string')) return null
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
  return {
    id: i.id,
    kind: i.kind,
    channelKey: i.channelKey,
    platform: i.platform as Platform,
    displayName: i.displayName,
    avatarUrl: str(i.avatarUrl),
    title: str(i.title),
    thumbnail: str(i.thumbnail),
    media: i.kind === 'vod' ? i.media : undefined
  }
}

export const savedOps = {
  toggle(item: Omit<SavedItem, 'savedAt'>): void {
    const items = getSaved()
    commit(items.some((i) => i.id === item.id) ? items.filter((i) => i.id !== item.id) : [...items, { ...item, savedAt: Date.now() }])
  },
  remove(id: string): void {
    commit(getSaved().filter((i) => i.id !== id))
  },
  reorder(sourceId: string, targetId: string): void {
    const items = [...getSaved()]
    const from = items.findIndex((i) => i.id === sourceId)
    const to = items.findIndex((i) => i.id === targetId)
    if (from < 0 || to < 0 || from === to) return
    items.splice(to, 0, items.splice(from, 1)[0])
    commit(items)
  }
}

/**
 * The channel's newest past stream that isn't the live broadcast (YouTube/Rumble list it under the
 * live video's id; Twitch/Kick list the in-progress recording, recognisable by its start time).
 */
export function newestRecording(streams: MediaItem[], platform: Platform, live?: LiveInfo): MediaItem | undefined {
  const liveStart = live?.startedAt ? Date.parse(live.startedAt) : NaN
  return streams.find((m) => {
    if (m.kind !== 'vod' || !(m.playUrl || m.hlsUrl)) return false
    if (!live) return true
    if (live.streamId && (m.id === live.streamId || (platform === 'rumble' && rumbleEmbedId(m.id) === live.streamId))) return false
    const published = m.publishedAt ? Date.parse(m.publishedAt) : NaN
    if (published >= liveStart - SAME_STREAM_SLACK_MS) return false
    const ends = published + durationSeconds(m.durationText) * 1000
    return !(Number.isNaN(liveStart) && ends >= Date.now() - STILL_RECORDING_SLACK_MS)
  })
}

/** Replaces a channel entry with its recording (keeping its place), or drops it if that's already saved. */
export function convertToVod(items: SavedItem[], channelId: string, media: MediaItem): SavedItem[] {
  const idx = items.findIndex((i) => i.id === channelId)
  if (idx < 0 || items[idx].kind !== 'channel') return items
  const src = items[idx]
  const id = savedVodId(src.platform, media.id)
  if (items.some((i) => i.id === id)) return items.filter((i) => i.id !== channelId)
  const next = [...items]
  next[idx] = { ...src, id, kind: 'vod', media, title: media.title || src.title, thumbnail: media.thumbnail ?? src.thumbnail, baselineId: undefined }
  return next
}

const inFlight = new Set<string>()
const lastCheck = new Map<string, number>()

/**
 * After a successful live poll of `platform`: while a saved channel is live, remember its newest
 * existing recording; once it's offline, swap the entry for the first newer recording.
 */
export function syncSaved(
  platform: Platform,
  live: Record<string, LiveInfo>,
  getPage: (channelKey: string) => Promise<ChannelPageData>,
  onChange: () => void
): void {
  for (const item of getSaved()) {
    if (item.kind !== 'channel' || item.platform !== platform || inFlight.has(item.id)) continue
    const l = live[item.channelKey]
    if (l ? item.baselineId !== undefined : Date.now() - (lastCheck.get(item.id) ?? 0) < RECHECK_MS) continue
    if (!l) lastCheck.set(item.id, Date.now())
    inFlight.add(item.id)
    void getPage(item.channelKey)
      .then((page) => {
        const newest = newestRecording(page.streams, platform, l)
        const items = getSaved()
        const current = items.find((i) => i.id === item.id)
        if (!current || current.kind !== 'channel') return
        if (l) {
          commit(items.map((i) => (i.id === item.id ? { ...i, baselineId: newest?.id ?? '' } : i)))
        } else if (newest && newest.id !== current.baselineId) {
          commit(convertToVod(items, item.id, newest))
        } else return
        onChange()
      })
      .catch((e) => console.error(`[watch later] ${item.channelKey}`, e))
      .finally(() => inFlight.delete(item.id))
  }
}
