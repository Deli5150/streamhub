import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform as OS, ToastAndroid } from 'react-native'
import { create } from 'zustand'
import type { SavedItem } from '@shared/types'
import type { NewSavedItem } from './ui'

// The video queue (the desktop's, renderer/lib/queue.ts): past streams, videos and clips lined up
// to play one after another. Added from a video's menu on a channel page, played in the playlist
// player (app/playlist.tsx, `queue`), and kept on this phone only.

const KEY = 'videoQueue'

interface QueueState {
  items: SavedItem[]
  add(item: NewSavedItem): void
  remove(id: string): void
  reorder(sourceId: string, targetId: string): void
  clear(): void
}

export const useQueue = create<QueueState>((set) => ({
  items: [],
  add: (item) => set((s) => (s.items.some((i) => i.id === item.id) ? s : { items: [...s.items, { ...item, savedAt: Date.now() }] })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  reorder: (sourceId, targetId) =>
    set((s) => {
      const items = [...s.items]
      const from = items.findIndex((i) => i.id === sourceId)
      const to = items.findIndex((i) => i.id === targetId)
      if (from < 0 || to < 0 || from === to) return s
      const [moved] = items.splice(from, 1)
      items.splice(to, 0, moved)
      return { items }
    }),
  clear: () => set({ items: [] })
}))

export async function loadQueue(): Promise<void> {
  const raw = await AsyncStorage.getItem(KEY).catch(() => null)
  try {
    const saved = raw ? (JSON.parse(raw) as { items?: unknown }) : null
    if (saved && Array.isArray(saved.items)) useQueue.setState({ items: saved.items as SavedItem[] })
  } catch {
    // Unreadable: start empty.
  }
  useQueue.subscribe((s) => void AsyncStorage.setItem(KEY, JSON.stringify({ items: s.items })).catch(() => undefined))
}

/** Adds a video to the end of the queue (you stay where you are) and says so on Android. */
export function addToQueue(item: NewSavedItem): void {
  useQueue.getState().add(item)
  if (OS.OS === 'android') ToastAndroid.show(`Added to queue · ${useQueue.getState().items.length}`, ToastAndroid.SHORT)
}
