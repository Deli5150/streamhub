import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import type { Channel, LiveInfo, MediaItem, Platform, SavedItem } from '@shared/types'
import { useApp } from './hub'

// Screen state shared across tabs (the desktop renderer's useUi), plus small helpers.

interface UiState {
  filter: Platform | 'all'
  setFilter(f: Platform | 'all'): void
}

export const useUi = create<UiState>((set) => ({
  filter: 'all',
  setFilter: (filter) => set({ filter })
}))

export function useChannel(key: string | null | undefined): { channel?: Channel; live?: LiveInfo } {
  const app = useApp((s) => s.app)
  if (!key || !app) return {}
  return { channel: app.channels.find((c) => c.key === key), live: app.live[key] }
}

// ---------- Watch Later (the renderer's lib/watchLater.ts) ----------

export type NewSavedItem = Omit<SavedItem, 'savedAt'>
export const savedChannelId = (channelKey: string): string => `channel:${channelKey}`
export const savedVodId = (platform: Platform, mediaId: string): string => `vod:${platform}:${mediaId}`

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

export const useIsSaved = (id: string): boolean => useApp((s) => Boolean(s.app?.watchLater.some((i) => i.id === id)))
export const savedTitle = (item: SavedItem): string => (item.kind === 'vod' ? item.title || item.displayName : item.displayName)

// ---------- Video progress (the renderer's lib/vodProgress.ts) ----------

const PROGRESS_KEY = 'streamhub:vod-progress'
const MAX_PROGRESS = 500

interface ProgressEntry {
  t: number
  d: number
  at: number
}

export const progressKey = (platform: Platform, id: string): string => `${platform}:${id}`

export const useVodProgress = create<{ entries: Record<string, ProgressEntry>; save(key: string, t: number, d: number): void }>((set, get) => ({
  entries: {},
  save(key, t, d) {
    if (!(d > 0) || !(t >= 0)) return
    const entries = { ...get().entries, [key]: { t, d, at: Date.now() } }
    const keys = Object.keys(entries)
    if (keys.length > MAX_PROGRESS) {
      for (const k of keys.sort((a, b) => entries[a].at - entries[b].at).slice(0, keys.length - MAX_PROGRESS)) delete entries[k]
    }
    AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(entries)).catch(() => undefined)
    set({ entries })
  }
}))

export async function loadProgress(): Promise<void> {
  const raw = await AsyncStorage.getItem(PROGRESS_KEY).catch(() => null)
  if (raw) useVodProgress.setState({ entries: JSON.parse(raw) as Record<string, ProgressEntry> })
}

export function progressFraction(entries: Record<string, ProgressEntry>, key: string): number | null {
  const e = entries[key]
  if (!e || e.t < 5) return null
  return e.t >= e.d - 30 ? 1 : Math.min(1, e.t / e.d)
}

export function resumePosition(key: string): number {
  const e = useVodProgress.getState().entries[key]
  if (!e || e.t < 10 || e.t >= e.d - 30) return 0
  return e.t
}
