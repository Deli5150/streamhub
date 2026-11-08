import type { Channel, LiveInfo, MediaItem, SavedItem } from '@shared/types'
import { useUi } from '../store'

// Renderer side of the Watch Later playlist (kept in the main process; see main/watchLater.ts).

export type NewSavedItem = Omit<SavedItem, 'savedAt'>

export const savedChannelId = (channelKey: string): string => `channel:${channelKey}`
export const savedVodId = (platform: Channel['platform'], mediaId: string): string => `vod:${platform}:${mediaId}`

export function savedLive(channel: Channel, live?: LiveInfo): NewSavedItem {
  return {
    id: savedChannelId(channel.key),
    kind: 'channel',
    channelKey: channel.key,
    platform: channel.platform,
    displayName: channel.displayName,
    avatarUrl: channel.avatarUrl,
    title: live?.title,
    thumbnail: live?.thumbnail
  }
}

export function savedVideo(channel: Channel, media: MediaItem): NewSavedItem {
  return {
    id: savedVodId(channel.platform, media.id),
    kind: 'vod',
    channelKey: channel.key,
    platform: channel.platform,
    displayName: channel.displayName,
    avatarUrl: channel.avatarUrl,
    title: media.title,
    thumbnail: media.thumbnail,
    media
  }
}

export const useWatchLater = (): SavedItem[] => useUi((s) => s.app?.watchLater) ?? EMPTY
const EMPTY: SavedItem[] = []

export const useIsSaved = (id: string): boolean => useUi((s) => Boolean(s.app?.watchLater?.some((i) => i.id === id)))

/** Row/cover label: the video's title, else the channel name. */
export const savedTitle = (item: SavedItem): string => (item.kind === 'vod' ? item.title || item.displayName : item.displayName)
