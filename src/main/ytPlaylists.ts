import type { ImportedPlaylist, SavedItem, YouTubePlaylistSummary } from '@shared/types'
import type { Provider } from './providers/types'
import { store } from './store'

// Imported YouTube playlists (Settings → YouTube playlists): the account's playlists you picked, with
// their videos, shown on Home and played like Watch Later. Their videos are re-read from YouTube now
// and then, so a playlist you add to on YouTube catches up here. Shared with the mobile app.

/** Imported playlists older than this are re-read from YouTube at launch. */
export const PLAYLIST_REFRESH_MS = 6 * 60 * 60_000

export const getPlaylists = (): ImportedPlaylist[] => store.get('ytPlaylists') ?? []
const commit = (list: ImportedPlaylist[]): void => store.set('ytPlaylists', list)

/** The account's playlists for the import picker. */
export function listPlaylists(youtube: Provider): Promise<YouTubePlaylistSummary[]> {
  if (!youtube.getPlaylists || !youtube.isConnected()) return Promise.reject(new Error('Connect YouTube first.'))
  return youtube.getPlaylists()
}

async function read(youtube: Provider, id: string, fallbackTitle: string, prev?: ImportedPlaylist): Promise<ImportedPlaylist> {
  const now = Date.now()
  const videos = await youtube.getPlaylistVideos!(id)
  // Keep each video's first-seen time, so items don't look new on every refresh.
  const seenAt = new Map(prev?.items.map((i) => [i.id, i.savedAt]))
  const items: SavedItem[] = videos.map((v) => ({ ...v, savedAt: seenAt.get(v.id) ?? now }))
  return { id, title: fallbackTitle, thumbnail: items[0]?.thumbnail ?? prev?.thumbnail, items, importedAt: prev?.importedAt ?? now, refreshedAt: now }
}

/** Imports the picked playlists (refreshing ones already imported), keeping import order. */
export async function importPlaylists(youtube: Provider, picked: YouTubePlaylistSummary[]): Promise<void> {
  if (!youtube.getPlaylistVideos) throw new Error("This version can't import YouTube playlists.")
  const imported = await Promise.all(
    picked.map((p) =>
      read(
        youtube,
        p.id,
        p.title,
        getPlaylists().find((x) => x.id === p.id)
      )
    )
  )
  const fresh = new Map(imported.map((p, i) => [p.id, { ...p, thumbnail: picked[i].thumbnail ?? p.thumbnail }]))
  const list = getPlaylists().map((p) => fresh.get(p.id) ?? p)
  for (const p of fresh.values()) if (!list.some((x) => x.id === p.id)) list.push(p)
  commit(list)
}

/** Re-reads one imported playlist's videos, or every one that's older than `olderThan` ms. */
export async function refreshPlaylists(youtube: Provider, id?: string, olderThan = 0): Promise<void> {
  if (!youtube.getPlaylistVideos || !youtube.isConnected()) return
  const due = getPlaylists().filter((p) => (id ? p.id === id : Date.now() - p.refreshedAt > olderThan))
  for (const p of due) {
    const next = await read(youtube, p.id, p.title, p).catch(() => null)
    // Removed while it was being read: leave it gone.
    if (next) commit(getPlaylists().map((x) => (x.id === p.id ? { ...next, thumbnail: p.thumbnail ?? next.thumbnail } : x)))
  }
}

export function removePlaylist(id: string): void {
  commit(getPlaylists().filter((p) => p.id !== id))
}
