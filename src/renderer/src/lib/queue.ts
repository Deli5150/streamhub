import { create } from 'zustand'
import type { SavedItem } from '@shared/types'
import type { NewSavedItem } from './watchLater'

// Video queue: past streams, videos, shorts and clips lined up to play one after another (added from
// a video's right-click menu). It plays in the same player and list as Watch Later (PlaylistView),
// and is kept on this computer only, surviving restarts.

const STORAGE_KEY = 'videoQueue'

interface QueueState {
  items: SavedItem[]
  /** The item playing (or last played) in the queue view. */
  activeId: string | null
  add(item: NewSavedItem): void
  remove(id: string): void
  reorder(sourceId: string, targetId: string): void
  setActive(id: string | null): void
  clear(): void
}

function restore(): Pick<QueueState, 'items' | 'activeId'> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Pick<QueueState, 'items' | 'activeId'> | null
    if (saved && Array.isArray(saved.items)) return { items: saved.items, activeId: saved.activeId ?? null }
  } catch {
    // Unreadable or unavailable: start empty.
  }
  return { items: [], activeId: null }
}

export const useQueue = create<QueueState>((set) => ({
  ...restore(),
  add: (item) => set((s) => (s.items.some((i) => i.id === item.id) ? s : { items: [...s.items, { ...item, savedAt: Date.now() }] })),
  remove: (id) =>
    set((s) => {
      const index = s.items.findIndex((i) => i.id === id)
      const items = s.items.filter((i) => i.id !== id)
      // Removing the playing item moves on to the one after it.
      const activeId = s.activeId === id ? (items[Math.min(index, items.length - 1)]?.id ?? null) : s.activeId
      return { items, activeId }
    }),
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
  setActive: (activeId) => set({ activeId }),
  clear: () => set({ items: [], activeId: null })
}))

useQueue.subscribe((s) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: s.items, activeId: s.activeId }))
  } catch {
    // Storage full or blocked: the queue still works for this session.
  }
})

/**
 * Adds a video to the queue. The first one starts the queue (opens its player); later ones line up
 * behind it while you keep browsing.
 */
export function addToQueue(item: NewSavedItem, open: () => void): void {
  const q = useQueue.getState()
  const starting = q.items.length === 0
  q.add(item)
  if (starting) {
    q.setActive(item.id)
    open()
  }
}
