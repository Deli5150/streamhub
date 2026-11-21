import { useEffect, useRef, useState } from 'react'
import { ArrowLeftIcon, KeyboardIcon, ListVideoIcon, PlayIcon, SearchIcon, XIcon } from 'lucide-react'
import type { Channel, ChannelPageData, ChannelPlaylist, MediaCategory, MediaItem } from '@shared/types'
import { focusEl, focusId, useBp, useBpInput } from '../../lib/bigPicture'
import { useChannelBrowse, type BrowseSnapshot, type ChannelBrowse } from '../../lib/channelBrowse'
import { groupOf } from '../../lib/combined'
import { progressFraction, progressKey, useVodProgress } from '../../lib/vodProgress'
import { savedVideo } from '../../lib/watchLater'
import { errorMessage, formatViewers, useUi } from '../../store'
import { ChannelAvatar } from '../ChannelAvatar'
import { PLATFORM_META } from '../platform'
import { BpButton, FOCUS, OnScreenKeyboard, Row, VideoCard } from './parts'

/** Which member of each combined channel was last shown, so coming back from a video keeps it. */
const lastMember = new Map<string, string>()

/** A YouTube channel's search or playlists when a video was opened from them, to show again on return. */
const lastBrowse = new Map<string, { mode: 'search' | 'playlists'; query: string; browse: BrowseSnapshot }>()

/**
 * A channel in Big Picture: watch it live, or pick from its past streams, videos and clips. A
 * combined channel has a button per platform (or LB/RB) to switch between its members' pages.
 * `restoreId` is the video to put focus back on when returning from it.
 */
export function BpChannel({ channelKey: routeKey, restoreId }: { channelKey: string; restoreId?: string }): React.JSX.Element {
  const app = useUi((s) => s.app)
  const pop = useBp((s) => s.pop)
  const group = app ? groupOf(app.settings.combined, routeKey) : undefined
  const members = group && app ? group.memberKeys.map((k) => app.channels.find((c) => c.key === k)).filter((c): c is Channel => Boolean(c)) : []
  const [activeKey, setActiveKeyState] = useState(() => {
    const remembered = group && lastMember.get(group.id)
    if (remembered && members.some((m) => m.key === remembered)) return remembered
    if (app?.live[routeKey]) return routeKey
    return members.find((m) => app?.live[m.key])?.key ?? routeKey
  })
  const setActiveKey = (key: string): void => {
    if (group) lastMember.set(group.id, key)
    setActiveKeyState(key)
  }
  const channelKey = activeKey
  const channel = app?.channels.find((c) => c.key === channelKey)
  const live = app?.live[channelKey]
  // Watch live: this member's stream, else another live member's (the player switches between them).
  const liveKey = live ? channelKey : members.find((m) => app?.live[m.key])?.key
  const push = useBp((s) => s.push)
  const entries = useVodProgress((s) => s.entries)
  const [page, setPage] = useState<ChannelPageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<MediaCategory | null>(null)
  // YouTube: search the channel's videos, or browse its playlists, in place of its rows. Coming back
  // from one of their videos (restoreId), they're as you left them.
  const [restored] = useState(() => (restoreId ? lastBrowse.get(channelKey) : undefined))
  const browse = useChannelBrowse(channel ?? ({ key: channelKey, platform: 'twitch' } as Channel), window.api, errorMessage, restored?.browse)
  const [mode, setMode] = useState<'search' | 'playlists' | null>(restored?.mode ?? null)
  const [query, setQuery] = useState(restored?.query ?? '')
  const [osk, setOsk] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Set when a list is asked for, so focus moves to its first card once it arrives.
  const focusOnLoad = useRef<string | null>(null)

  const firstLoad = useRef(true)
  useEffect(() => {
    let cancelled = false
    setPage(null)
    setError(null)
    if (!firstLoad.current) {
      setMode(null)
      setQuery('')
      setOsk(false)
    }
    firstLoad.current = false
    // A refreshed copy keeps anything already loaded further along a row.
    const take = (fresh: ChannelPageData): void =>
      setPage((prev) =>
        prev
          ? {
              ...fresh,
              streams: prev.streams.length > fresh.streams.length ? prev.streams : fresh.streams,
              videos: prev.videos.length > fresh.videos.length ? prev.videos : fresh.videos,
              clips: prev.clips.length > fresh.clips.length ? prev.clips : fresh.clips
            }
          : fresh
      )
    window.api.getChannelPage(channelKey).then(
      (p) => !cancelled && take(p),
      (e) => !cancelled && setError(errorMessage(e))
    )
    const off = window.api.onChannelPage((key, fresh) => {
      if (key === channelKey && !cancelled) take(fresh)
    })
    return () => {
      cancelled = true
      off()
    }
  }, [channelKey])

  const loadMore = async (category: MediaCategory): Promise<void> => {
    const cursor = page?.cursors[category]
    if (!cursor || loading) return
    setLoading(category)
    try {
      const res = await window.api.loadMore(channelKey, category, cursor)
      setPage((p) => {
        if (!p) return p
        const seen = new Set(p[category].map((m) => m.id))
        return {
          ...p,
          [category]: [...p[category], ...res.items.filter((m) => !seen.has(m.id))],
          cursors: { ...p.cursors, [category]: res.cursor }
        }
      })
    } catch {
      // The row just stops growing.
    } finally {
      setLoading(null)
    }
  }

  // Where focus starts: Watch live if live; otherwise the first video once they've loaded (the
  // Back button until then); coming back from a video, that video.
  const loaded = Boolean(page)
  const settled = useRef(false)
  useEffect(() => {
    requestAnimationFrame(() => {
      if (focusId(restoreId)) settled.current = true
      else focusId(liveKey ? 'watch-live' : 'ch-back')
    })
    // Only when the screen opens.
  }, [])
  useEffect(() => {
    if (!loaded || settled.current) return
    settled.current = true
    requestAnimationFrame(() => {
      if (focusId(restoreId) || liveKey) return
      if ((document.activeElement as HTMLElement | null)?.dataset.bpId === 'ch-back') focusEl(document.querySelector<HTMLElement>('[data-bp-rows] [data-bp]'))
    })
    // Once, when the first page of videos arrives.
  }, [loaded])

  // LB/RB switch between a combined channel's platforms.
  useBpInput((action) => {
    if ((action !== 'lb' && action !== 'rb') || members.length < 2) return false
    const at = Math.max(
      0,
      members.findIndex((m) => m.key === activeKey)
    )
    const next = members[(at + (action === 'lb' ? members.length - 1 : 1)) % members.length]
    setActiveKey(next.key)
    requestAnimationFrame(() => focusId(`ch-member:${next.key}`))
    return true
  })

  const submitSearch = (): void => {
    if (!query.trim()) return
    setOsk(false)
    focusOnLoad.current = 'search'
    browse.search(query)
  }
  const leaveMode = (): void => {
    const was = mode
    setMode(null)
    setOsk(false)
    setQuery('')
    browse.close()
    requestAnimationFrame(() => focusId(was === 'search' ? 'ch-search' : 'ch-playlists'))
  }

  // Search and playlists: the on-screen keyboard's X / Y / B, A on the search box, and B to step back.
  useBpInput((action, source) => {
    if (!mode) return false
    const onKeyboard = Boolean(document.activeElement?.closest('[data-bp-osk]'))
    if (osk && (((action === 'x' || action === 'y') && onKeyboard) || action === 'back')) {
      if (action === 'x') setQuery((q) => q.slice(0, -1))
      else if (action === 'y') setQuery((q) => q + ' ')
      else {
        setOsk(false)
        requestAnimationFrame(() => focusId('ch-osk-toggle'))
      }
      return true
    }
    if (action === 'select' && document.activeElement === inputRef.current) {
      if (source === 'pad') {
        setOsk(true)
        requestAnimationFrame(() => focusId('osk:a'))
      } else submitSearch()
      return true
    }
    if (action === 'back') {
      const view = browse.view
      if (view?.kind === 'playlist') {
        browse.openPlaylists()
        requestAnimationFrame(() => focusId(`pl:${view.playlist.id}`))
      } else leaveMode()
      return true
    }
    return false
  })

  const browseItems = mode === 'playlists' ? browse.playlists.items.length : 0
  const resultItems = browse.videos.items.length
  useEffect(() => {
    const want = focusOnLoad.current
    if (!want) return
    const first = (row: string): boolean => {
      const el = document.querySelector<HTMLElement>(`[data-bp-browse="${row}"] [data-bp]`)
      focusEl(el)
      return Boolean(el)
    }
    if (want === 'playlists' && browseItems) requestAnimationFrame(() => first('playlists') && (focusOnLoad.current = null))
    else if ((want === 'search' || want === 'playlist') && resultItems) requestAnimationFrame(() => first(want) && (focusOnLoad.current = null))
  }, [browseItems, resultItems])

  if (!channel) return <p className="px-16 pt-16 text-[22px] text-white/60">This channel isn't in your follows anymore.</p>
  const meta = PLATFORM_META[channel.platform]
  const rows: Array<{ category: MediaCategory; title: string }> = page
    ? [
        {
          category: 'streams',
          title: page.hasVideos && channel.platform === 'youtube' ? 'Past live streams' : 'Past streams'
        },
        ...(page.hasVideos ? [{ category: 'videos' as const, title: 'Videos' }] : []),
        ...(page.clipsLabel ? [{ category: 'clips' as const, title: page.clipsLabel }] : [])
      ]
    : []

  return (
    <div data-bp-scroller="" className="h-full overflow-y-auto pb-24 [scrollbar-width:none]">
      <header data-bp-top="" className="relative mb-6 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-50"
          style={page?.bannerUrl ? { backgroundImage: `url("${page.bannerUrl}")` } : { background: meta.banner ?? '#26262c' }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to top, #0b0b10, rgba(11,11,16,0.6) 50%, rgba(11,11,16,0.2))'
          }}
        />
        <div className="relative flex items-end gap-8 px-16 pt-20 pb-6">
          <ChannelAvatar
            src={channel.avatarUrl}
            name={channel.displayName}
            className={`size-36 shrink-0 rounded-full bg-white/10 object-cover ${live ? 'ring-[6px] ring-[#e5242c]' : 'ring-4 ring-white/20'}`}
            fallbackTextClassName="text-[48px] font-semibold text-white/70"
          />
          <div className="min-w-0 flex-1 pb-2">
            <p className="flex items-center gap-2 text-[18px] font-semibold text-white/70">
              <meta.Icon className="size-5" strokeWidth={2.5} />
              {meta.label}
              {live && (
                <span className="ml-2 rounded-md bg-[#e5242c] px-2 py-0.5 text-[14px] font-bold text-white">
                  LIVE
                  {live.viewers !== undefined ? ` · ${formatViewers(live.viewers)}` : ''}
                </span>
              )}
            </p>
            <h1 className="mt-1 truncate text-[52px] leading-tight font-extrabold tracking-tight text-white">{channel.displayName}</h1>
            {live?.title && <p className="mt-1 line-clamp-1 text-[21px] text-white/80">{live.title}</p>}
          </div>
        </div>
        <div className="relative flex items-center gap-4 px-16 pb-8">
          <BpButton id="ch-back" onPress={pop} icon={<ArrowLeftIcon className="size-6" />} title="Back" />
          {liveKey && (
            <BpButton id="watch-live" icon={<PlayIcon className="size-6 fill-current" />} onPress={() => push({ kind: 'live', key: liveKey })}>
              {liveKey === channelKey ? 'Watch live' : `Watch live on ${PLATFORM_META[liveKey.split(':')[0] as Channel['platform']].label}`}
            </BpButton>
          )}
          {browse.available && (
            <>
              <BpButton
                id="ch-search"
                active={mode === 'search'}
                icon={<SearchIcon className="size-6" />}
                onPress={() => {
                  if (mode === 'search') return leaveMode()
                  browse.close()
                  setMode('search')
                  requestAnimationFrame(() => focusEl(inputRef.current))
                }}
              >
                Search
              </BpButton>
              <BpButton
                id="ch-playlists"
                active={mode === 'playlists'}
                icon={<ListVideoIcon className="size-6" />}
                onPress={() => {
                  if (mode === 'playlists') return leaveMode()
                  setQuery('')
                  setOsk(false)
                  setMode('playlists')
                  focusOnLoad.current = 'playlists'
                  browse.openPlaylists()
                }}
              >
                Playlists
              </BpButton>
            </>
          )}
          {members.length > 1 && (
            <div className="ml-4 flex items-center gap-3">
              {members.map((m) => {
                const mm = PLATFORM_META[m.platform]
                return (
                  <BpButton
                    key={m.key}
                    id={`ch-member:${m.key}`}
                    active={m.key === activeKey}
                    onPress={() => setActiveKey(m.key)}
                    icon={<mm.Icon className="size-5" strokeWidth={2.5} />}
                    title={m.displayName}
                  >
                    {mm.label}
                    {app?.live[m.key] && <span className="size-2.5 rounded-full bg-[#ff3b30]" />}
                  </BpButton>
                )
              })}
            </div>
          )}
        </div>
      </header>

      {mode === 'search' && (
        <div className="mb-8">
          <div data-bp-top="" className="flex items-center gap-4 px-16">
            <label className="relative flex h-16 w-[min(760px,60vw)] items-center">
              <SearchIcon className="pointer-events-none absolute left-6 z-20 size-7 text-white/60" strokeWidth={2.25} />
              <input
                ref={inputRef}
                data-bp=""
                data-bp-id="ch-search-box"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitSearch()
                }}
                placeholder={`Search ${channel.displayName}'s videos`}
                spellCheck={false}
                className={`${FOCUS} h-full w-full rounded-full bg-white/12 pr-6 pl-[72px] text-[24px] font-semibold text-white placeholder:text-white/40 focus:scale-100 focus:bg-white/18`}
              />
            </label>
            <BpButton
              id="ch-osk-toggle"
              active={osk}
              title={osk ? 'Hide the on-screen keyboard' : 'Show the on-screen keyboard'}
              onPress={() => {
                setOsk(!osk)
                if (!osk) requestAnimationFrame(() => focusId('osk:a'))
              }}
              icon={<KeyboardIcon className="size-6" />}
            >
              Keyboard
            </BpButton>
            {query && (
              <BpButton id="ch-search-go" onPress={submitSearch} icon={<SearchIcon className="size-6" />}>
                Search
              </BpButton>
            )}
            {query && <BpButton id="ch-search-clear" title="Clear" onPress={() => setQuery('')} icon={<XIcon className="size-6" />} />}
          </div>
          {osk && <OnScreenKeyboard onType={(t) => setQuery((q) => q + t)} onBackspace={() => setQuery((q) => q.slice(0, -1))} onClear={() => setQuery('')} onDone={submitSearch} doneLabel="Search" />}
        </div>
      )}

      {mode && (
        <BrowseRows
          browse={browse}
          platform={channel.platform}
          onPlay={(m) => {
            if (!m.playUrl && !m.hlsUrl) return
            lastBrowse.set(channelKey, { mode, query, browse: browse.snapshot() })
            push({ kind: 'vod', key: channelKey, media: m })
          }}
          onOpenPlaylist={(p) => {
            focusOnLoad.current = 'playlist'
            browse.openPlaylist(p)
          }}
          channel={channel}
        />
      )}

      {!mode && !page && !error && <p className="px-16 text-[20px] text-white/55">Loading videos…</p>}
      {!mode && error && !page && <p className="px-16 text-[20px] text-white/55">Couldn't load this channel's videos: {error}</p>}
      <div data-bp-rows="" className={mode ? 'hidden' : undefined}>
        {rows.map(({ category, title }) =>
          page && page[category].length ? (
            <Row key={category} title={title}>
              {page[category].map((m, i) => (
                <VideoCard
                  key={m.id}
                  id={`${category}:${m.id}`}
                  thumbnail={m.thumbnail}
                  title={m.title}
                  subtitle={[m.viewCountText, m.publishedText].filter(Boolean).join(' · ')}
                  badge={m.durationText}
                  progress={progressFraction(entries, progressKey(channel.platform, m.id))}
                  onFocus={() => {
                    if (i >= page[category].length - 4) void loadMore(category)
                  }}
                  onPress={() => (m.playUrl || m.hlsUrl ? push({ kind: 'vod', key: channelKey, media: m }) : undefined)}
                menu={m.playUrl || m.hlsUrl ? { item: savedVideo(channel, m), title: m.title } : undefined}
                />
              ))}
            </Row>
          ) : null
        )}
      </div>
      {!mode && page && rows.every(({ category }) => !page[category].length) && <p className="px-16 text-[20px] text-white/55">No past streams or videos.</p>}
    </div>
  )
}

/** The search results, or a channel's playlists (and the open one's videos), as Big Picture rows. */
function BrowseRows({
  browse,
  channel,
  platform,
  onPlay,
  onOpenPlaylist
}: {
  browse: ChannelBrowse
  channel: Channel
  platform: Channel['platform']
  onPlay(m: MediaItem): void
  onOpenPlaylist(p: ChannelPlaylist): void
}): React.JSX.Element | null {
  const entries = useVodProgress((s) => s.entries)
  const { view, videos, playlists } = browse
  if (!view) return null
  const note = (text: string): React.JSX.Element => <p className="mb-10 px-16 text-[20px] text-white/55">{text}</p>
  const videoRow = (row: string, title: string, empty: string): React.JSX.Element =>
    videos.items.length ? (
      <div data-bp-browse={row}>
        <Row title={title} count={videos.cursor ? undefined : videos.items.length}>
          {videos.items.map((m, i) => (
            <VideoCard
              key={m.id}
              id={`${row}:${m.id}`}
              thumbnail={m.thumbnail}
              title={m.title}
              subtitle={[m.viewCountText, m.publishedText].filter(Boolean).join(' · ')}
              badge={m.durationText}
              progress={progressFraction(entries, progressKey(platform, m.id))}
              onFocus={() => {
                if (i >= videos.items.length - 4) browse.more()
              }}
              onPress={() => onPlay(m)}
              menu={m.playUrl || m.hlsUrl ? { item: savedVideo(channel, m), title: m.title } : undefined}
            />
          ))}
        </Row>
      </div>
    ) : (
      note(videos.loading ? 'Loading…' : (videos.error ?? empty))
    )

  if (view.kind === 'search') return videoRow('search', `Results for “${view.query}”`, `No videos on this channel match “${view.query}”.`)
  return (
    <>
      {playlists.items.length ? (
        <div data-bp-browse="playlists">
          <Row title="Playlists">
            {playlists.items.map((p, i) => (
              <VideoCard
                key={p.id}
                id={`pl:${p.id}`}
                thumbnail={p.thumbnail}
                title={p.title}
                subtitle={view.kind === 'playlist' && view.playlist.id === p.id ? 'Showing below' : undefined}
                badge={p.videoCountText}
                onFocus={() => {
                  if (view.kind === 'playlists' && i >= playlists.items.length - 4) browse.more()
                }}
                onPress={() => onOpenPlaylist(p)}
              />
            ))}
          </Row>
        </div>
      ) : (
        note(playlists.loading ? 'Loading playlists…' : (playlists.error ?? 'This channel has no public playlists.'))
      )}
      {view.kind === 'playlist' && videoRow('playlist', view.playlist.title, 'This playlist has no videos you can watch.')}
    </>
  )
}
