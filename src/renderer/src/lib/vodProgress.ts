import { create } from 'zustand'
import type { Platform } from '@shared/types'

// How far you got in each past stream / video, so grids show a progress bar and players resume.

const STORAGE_KEY = 'streamhub:vod-progress'
const MAX_ENTRIES = 500

interface Entry {
  /** seconds watched */
  t: number
  /** duration in seconds */
  d: number
  at: number
}

function read(): Record<string, Entry> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export const progressKey = (platform: Platform, id: string): string => `${platform}:${id}`

interface ProgressState {
  entries: Record<string, Entry>
  save(key: string, t: number, d: number): void
}

export const useVodProgress = create<ProgressState>((set, get) => ({
  entries: read(),
  save(key, t, d) {
    if (!(d > 0) || !(t >= 0)) return
    const entries = { ...get().entries, [key]: { t, d, at: Date.now() } }
    // Keep the most recent entries only.
    const keys = Object.keys(entries)
    if (keys.length > MAX_ENTRIES) {
      for (const k of keys.sort((a, b) => entries[a].at - entries[b].at).slice(0, keys.length - MAX_ENTRIES)) delete entries[k]
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    } catch {
      // storage full / unavailable: progress just isn't remembered
    }
    set({ entries })
  }
}))

/** 0–1 watched, or null if never started. Near the end counts as finished. */
export function progressFraction(entries: Record<string, Entry>, key: string): number | null {
  const e = entries[key]
  if (!e || e.t < 5) return null
  return e.t >= e.d - 30 ? 1 : Math.min(1, e.t / e.d)
}

/** Where to resume, or 0 to start from the beginning (unwatched, barely started, or finished). */
export function resumePosition(key: string): number {
  const e = useVodProgress.getState().entries[key]
  if (!e || e.t < 10 || e.t >= e.d - 30) return 0
  return e.t
}

/**
 * The player URL starting at `seconds`, for players that take a start time in their URL (YouTube,
 * Twitch VODs). More reliable than seeking from a script, which some players undo while loading.
 */
export function withStartTime(url: string, seconds: number): string {
  const t = Math.floor(seconds)
  if (!(t > 0)) return url
  try {
    const u = new URL(url)
    if (u.hostname === 'www.youtube.com' && u.pathname.startsWith('/embed/')) u.searchParams.set('start', String(t))
    else if (u.hostname === 'player.twitch.tv' && u.searchParams.has('video')) u.searchParams.set('time', `${Math.floor(t / 3600)}h${Math.floor((t % 3600) / 60)}m${t % 60}s`)
    else return url
    return u.toString()
  } catch {
    return url
  }
}
