import { useEffect, useRef, useState } from 'react'
import type { Api, Channel, ChannelPlaylist, MediaItem } from '@shared/types'

// The Videos tab of a YouTube channel page can search the channel or list its playlists instead of
// its uploads. Shared by the desktop and phone channel pages.

export type BrowseView = { kind: 'search'; query: string } | { kind: 'playlists' } | { kind: 'playlist'; playlist: ChannelPlaylist }
export interface Listing<T> {
  items: T[]
  cursor: string | null
  loading: boolean
  error?: string
}
const EMPTY_LISTING: Listing<never> = { items: [], cursor: null, loading: false }

/** Where the lists come from: the desktop's window.api, or the phone's hub actions. */
export type BrowseApi = Pick<Api, 'searchChannel' | 'getChannelPlaylists' | 'getPlaylistPage'>

/** What a browse was showing, to pick it up again (Big Picture, coming back from a video). */
export interface BrowseSnapshot {
  view: BrowseView | null
  videos: Listing<MediaItem>
  playlists: Listing<ChannelPlaylist> | null
}

/** Searching a YouTube channel's videos and opening its playlists (each page loads as you ask for more). */
export function useChannelBrowse(channel: Channel, api: BrowseApi, describe: (e: unknown) => string, saved?: BrowseSnapshot) {
  const [view, setView] = useState<BrowseView | null>(saved?.view ?? null)
  const [videos, setVideos] = useState<Listing<MediaItem>>(() => (saved ? { ...saved.videos, loading: false } : EMPTY_LISTING))
  const [playlists, setPlaylists] = useState<Listing<ChannelPlaylist> | null>(() => (saved?.playlists ? { ...saved.playlists, loading: false } : null))
  // Answers for a view you've since left are dropped.
  const request = useRef(0)

  // Switching to another channel starts over (not the first run, which may have been restored).
  const shownKey = useRef(channel.key)
  useEffect(() => {
    if (shownKey.current === channel.key) return
    shownKey.current = channel.key
    request.current++
    setView(null)
    setVideos(EMPTY_LISTING)
    setPlaylists(null)
  }, [channel.key])

  const loadVideos = (next: BrowseView, cursor?: string): void => {
    const id = ++request.current
    setVideos((v) => (cursor ? { ...v, loading: true } : { ...EMPTY_LISTING, loading: true }))
    const res =
      next.kind === 'search'
        ? api.searchChannel(channel.key, next.query, cursor)
        : next.kind === 'playlist'
          ? api.getPlaylistPage(next.playlist.id, cursor)
          : null
    res?.then(
      (page) =>
        id === request.current &&
        setVideos((v) => {
          const seen = new Set(cursor ? v.items.map((m) => m.id) : [])
          return { items: [...(cursor ? v.items : []), ...page.items.filter((m) => !seen.has(m.id))], cursor: page.cursor, loading: false }
        }),
      (e) => id === request.current && setVideos((v) => ({ ...v, loading: false, error: describe(e) }))
    )
  }

  const loadPlaylists = (cursor?: string): void => {
    setPlaylists((l) => ({ ...(cursor && l ? l : EMPTY_LISTING), loading: true }))
    api.getChannelPlaylists(channel.key, cursor).then(
      (page) =>
        setPlaylists((l) => {
          const prev = cursor && l ? l.items : []
          const seen = new Set(prev.map((p) => p.id))
          return { items: [...prev, ...page.playlists.filter((p) => !seen.has(p.id))], cursor: page.cursor, loading: false }
        }),
      (e) => setPlaylists((l) => ({ ...(l ?? EMPTY_LISTING), loading: false, error: describe(e) }))
    )
  }

  return {
    available: channel.platform === 'youtube',
    snapshot: (): BrowseSnapshot => ({ view, videos, playlists }),
    view,
    videos,
    playlists: playlists ?? EMPTY_LISTING,
    search(query: string): void {
      const next = { kind: 'search', query: query.trim() } as const
      setView(next)
      loadVideos(next)
    },
    openPlaylists(): void {
      request.current++
      setView({ kind: 'playlists' })
      if (!playlists || playlists.error) loadPlaylists()
    },
    openPlaylist(playlist: ChannelPlaylist): void {
      const next = { kind: 'playlist', playlist } as const
      setView(next)
      loadVideos(next)
    },
    more(): void {
      if (view?.kind === 'playlists') {
        if (playlists?.cursor && !playlists.loading) loadPlaylists(playlists.cursor)
      } else if (view && videos.cursor && !videos.loading) loadVideos(view, videos.cursor)
    },
    close(): void {
      request.current++
      setView(null)
    }
  }
}

export type ChannelBrowse = ReturnType<typeof useChannelBrowse>
