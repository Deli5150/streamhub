import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpDownIcon, BookmarkCheckIcon, BookmarkIcon, CheckIcon, ExternalLinkIcon, ListPlusIcon, ListXIcon, Loader2Icon, PictureInPicture2Icon, PlayIcon, RadioIcon, UsersIcon, XIcon } from 'lucide-react'
import type { Channel, ChannelPageData, LiveInfo, MediaCategory, MediaItem } from '@shared/types'
import { channelPageUrl } from '@shared/urls'
import { groupOf } from '../lib/combined'
import { progressFraction, progressKey, resumePosition, useVodProgress, withStartTime } from '../lib/vodProgress'
import { ChaptersButton, useChapters } from './Chapters'
import { addToQueue, useQueue } from '../lib/queue'
import { savedVideo } from '../lib/watchLater'
import { errorMessage, useUi } from '../store'
import { ChannelAvatar } from './ChannelAvatar'
import { useChannelMenu } from './channelMenu'
import { HlsVideo } from './HlsVideo'
import { PLATFORM_META, PlatformOverlayBadge } from './platform'
import { Thumbnail } from './Thumbnail'
import { SaveForLaterButton } from './SaveForLater'
import { Button, EmptyState, useContextMenu } from './ui'
import { WebView } from './WebView'

type ClipWindow = 'all' | '24h' | '7d' | '30d'
const CLIP_WINDOW_MS: Record<Exclude<ClipWindow, 'all'>, number> = { '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 }
const CLIP_WINDOW_LABEL: Record<Exclude<ClipWindow, 'all'>, string> = { '24h': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days' }
const REFRESH_MS = 5 * 60_000

/** Each platform's tabs, so they show immediately while the page loads. */
const PLATFORM_TABS: Record<Channel['platform'], { hasVideos: boolean; clipsLabel: ChannelPageData['clipsLabel'] }> = {
  twitch: { hasVideos: false, clipsLabel: 'Clips' },
  youtube: { hasVideos: true, clipsLabel: 'Shorts' },
  kick: { hasVideos: false, clipsLabel: 'Clips' },
  rumble: { hasVideos: true, clipsLabel: null }
}

/** A channel's page: banner, past streams / uploads / clips in tabs, and an in-place video player. */
export function ChannelPage({ channel, live }: { channel: Channel; live?: LiveInfo }): React.JSX.Element {
  const { app, go, set } = useUi()
  const menu = useChannelMenu()
  const videoMenu = useContextMenu()
  const meta = PLATFORM_META[channel.platform]
  const [page, setPage] = useState<ChannelPageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<MediaCategory>('streams')
  // Set once you pick a tab, so the page never switches tabs on you after that.
  const pickedTab = useRef(false)
  const [playing, setPlaying] = useState<MediaItem | null>(null)
  const [loadingMore, setLoadingMore] = useState<MediaCategory | null>(null)
  const [clipSort, setClipSort] = useState<'newest' | 'oldest'>('newest')
  const [clipWindow, setClipWindow] = useState<ClipWindow>('all')

  // Load (and refresh every few minutes); switching channels resets everything.
  useEffect(() => {
    let cancelled = false
    setPage(null)
    setError(null)
    setTab('streams')
    pickedTab.current = false
    setPlaying(null)
    const load = (): void => {
      window.api.getChannelPage(channel.key).then(
        (p) => !cancelled && setPage((prev) => (prev ? { ...p, ...mergeLoaded(prev, p) } : p)),
        (e) => !cancelled && setError(errorMessage(e))
      )
    }
    load()
    const timer = setInterval(load, REFRESH_MS)
    // The first load returns the saved copy instantly; the refreshed page arrives here.
    const off = window.api.onChannelPage((key, fresh) => {
      if (key === channel.key && !cancelled) setPage((prev) => (prev ? { ...fresh, ...mergeLoaded(prev, fresh) } : fresh))
    })
    return () => {
      cancelled = true
      clearInterval(timer)
      off()
    }
  }, [channel.key])

  // A channel with no past streams but with videos opens on Videos.
  useEffect(() => {
    if (!pickedTab.current && page?.hasVideos && page.streams.length === 0 && page.videos.length > 0) setTab('videos')
  }, [page])

  const loadMore = async (category: MediaCategory): Promise<void> => {
    const cursor = page?.cursors[category]
    if (!cursor || loadingMore) return
    setLoadingMore(category)
    try {
      const res = await window.api.loadMore(channel.key, category, cursor)
      setPage((p) => {
        if (!p) return p
        const seen = new Set(p[category].map((m) => m.id))
        return { ...p, [category]: [...p[category], ...res.items.filter((m) => !seen.has(m.id))], cursors: { ...p.cursors, [category]: res.cursor } }
      })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoadingMore(null)
    }
  }

  const group = app ? groupOf(app.settings.combined, channel.key) : undefined
  const members = useMemo(
    () => (group && app ? group.memberKeys.map((k) => app.channels.find((c) => c.key === k)).filter((c): c is Channel => Boolean(c)) : []),
    [group, app]
  )

  const clips = useMemo(() => {
    if (!page) return []
    const ts = (m: MediaItem): number => (m.publishedAt ? Date.parse(m.publishedAt) : NaN)
    const windowed = clipWindow === 'all' ? page.clips : page.clips.filter((m) => Date.now() - ts(m) <= CLIP_WINDOW_MS[clipWindow])
    return [...windowed].sort((a, b) => {
      const ta = ts(a)
      const tb = ts(b)
      if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.isNaN(ta) ? 1 : Number.isNaN(tb) ? -1 : 0
      return clipSort === 'newest' ? tb - ta : ta - tb
    })
  }, [page, clipSort, clipWindow])

  const { hasVideos, clipsLabel } = page ?? PLATFORM_TABS[channel.platform]
  const tabs: Array<{ id: MediaCategory; label: string }> = [
    { id: 'streams', label: 'Past streams' },
    ...(hasVideos ? [{ id: 'videos' as const, label: 'Videos' }] : []),
    ...(clipsLabel ? [{ id: 'clips' as const, label: clipsLabel }] : [])
  ]
  const items = tab === 'clips' ? clips : (page?.[tab] ?? [])
  const emptyText =
    tab === 'clips' && clipWindow !== 'all' && page?.clips.length
      ? `No ${clipsLabel?.toLowerCase()} from the ${CLIP_WINDOW_LABEL[clipWindow].toLowerCase()}.`
      : `No ${tab === 'streams' ? 'past streams' : tab === 'videos' ? 'videos' : (clipsLabel?.toLowerCase() ?? 'clips')} found for this channel.`

  return (
    <div className="h-full overflow-y-auto">
      {/* Banner (YouTube's own, else the platform's brand banner) with the avatar overlapping it. */}
      <div className="relative h-40 w-full shrink-0 bg-control-subtle">
        {page?.bannerUrl ? (
          <img src={page.bannerUrl} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
        ) : meta.banner ? (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: meta.banner }}>
            {meta.logo && <img src={meta.logo} alt="" draggable={false} className="max-h-12 max-w-[55%] object-contain select-none" />}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-support-red/30 to-control-subtle">
            <meta.Icon className="size-14 text-white/80" strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
        <div className="absolute -bottom-8 left-6">
          <div className="relative">
            <ChannelAvatar
              src={channel.avatarUrl}
              name={channel.displayName}
              className="size-20 rounded-full bg-control object-cover ring-4 ring-background"
              fallbackTextClassName="text-heading1 text-secondary"
            />
            <PlatformOverlayBadge platform={channel.platform} />
          </div>
        </div>
      </div>

      <div className="px-6 pt-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-heading2 text-primary">{channel.displayName}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-regular text-tertiary">
              <meta.Icon className={`size-3.5 ${meta.accent}`} strokeWidth={2.5} />
              {meta.label}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {live && (
              <button
                type="button"
                onClick={() => go({ kind: 'watch', key: channel.key })}
                title="Back to the live stream"
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-support-red px-3 transition-colors hover:bg-support-red/90"
              >
                <RadioIcon className="size-4 shrink-0 text-white" />
                <span className="text-small-strong text-white">Back to live</span>
              </button>
            )}
            <Button onClick={() => window.api.openExternal(channelPageUrl(channel))}>
              <ExternalLinkIcon className="size-3.5" strokeWidth={2.25} />
              Open on {meta.label}
            </Button>
          </div>
        </div>

        {/* Combine: left-click opens the combine flow; right-click shows the full channel menu. */}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => set({ combine: { group: group ?? null, seedKey: channel.key } })}
            onContextMenu={(e) => menu.openFor(e, channel)}
            title={group ? 'Edit combined channels' : 'Combine with another channel'}
            className="flex size-8 items-center justify-center rounded-full bg-control ring-1 ring-separator transition-colors hover:bg-control-active"
          >
            <UsersIcon className="size-4 shrink-0 text-secondary" />
          </button>
          {!live && (
            <span className="flex items-center gap-1.5 text-regular text-tertiary">
              <RadioIcon className="size-4 shrink-0" />
              This channel is currently offline.
            </span>
          )}
        </div>

        {/* Combined channel: jump between each member's page. */}
        {members.length >= 2 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {members.map((m) => {
              const active = m.key === channel.key
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => go({ kind: 'watch', key: m.key, offline: true })}
                  title={`Open ${m.displayName}'s ${PLATFORM_META[m.platform].label} page`}
                  aria-pressed={active}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full pr-2.5 pl-1 transition-colors ${
                    active ? 'bg-control ring-1 ring-secondary' : 'bg-control-subtle hover:bg-control'
                  }`}
                >
                  <span className="relative shrink-0">
                    <ChannelAvatar src={m.avatarUrl} name={m.displayName} className="size-6 rounded-full bg-control object-cover" fallbackTextClassName="text-small text-secondary" />
                    <span className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-background ${PLATFORM_META[m.platform].activeBg}`} />
                  </span>
                  <span className={`text-small-strong ${active ? 'text-primary' : 'text-secondary'}`}>{m.displayName}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="px-6 pt-5 pb-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex rounded-lg bg-control-subtle p-0.5 ring-1 ring-separator" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => {
                  pickedTab.current = true
                  setTab(t.id)
                }}
                className={`flex h-7 items-center rounded-md px-3 text-small-strong transition-colors ${
                  tab === t.id ? 'bg-control-active text-primary shadow-sm' : 'text-secondary hover:text-primary'
                }`}
              >
                {t.label}
                {page && <span className="ml-1.5 text-tertiary tabular-nums">{(t.id === 'clips' ? page.clips : page[t.id]).length}{page.cursors[t.id] ? '+' : ''}</span>}
              </button>
            ))}
          </div>
          {tab === 'clips' && (
            <ClipFilter sort={clipSort} onSort={setClipSort} window={clipWindow} onWindow={setClipWindow} />
          )}
        </div>

        {error && !page ? (
          <EmptyState icon={<RadioIcon className="size-8 text-tertiary" />} title="Couldn't load this channel" description={error}>
            <Button onClick={() => window.api.openExternal(channelPageUrl(channel))}>Open on {meta.label}</Button>
          </EmptyState>
        ) : (
          <MediaGrid
            items={items}
            loading={!page}
            portrait={tab === 'clips' && clipsLabel === 'Shorts'}
            emptyText={emptyText}
            platform={channel.platform}
            onPlay={setPlaying}
            onContextMenu={(e, m) => {
              const item = savedVideo(channel, m)
              const saved = app?.watchLater?.some((i) => i.id === item.id)
              const queued = useQueue.getState().items.some((i) => i.id === item.id)
              videoMenu.open(e, [
                { label: 'Play', icon: <PlayIcon className="size-3.5" />, onSelect: () => setPlaying(m) },
                queued
                  ? { label: 'Remove from queue', icon: <ListXIcon className="size-3.5" />, onSelect: () => useQueue.getState().remove(item.id) }
                  : {
                      label: 'Add to queue',
                      icon: <ListPlusIcon className="size-3.5" />,
                      disabled: !m.playUrl && !m.hlsUrl,
                      onSelect: () => {
                        const count = addToQueue(item)
                        useUi.getState().showToast({
                          text: `Added to queue · ${count} ${count === 1 ? 'video' : 'videos'}`,
                          action: { label: 'Play queue', run: () => go({ kind: 'queue' }) }
                        })
                      }
                    },
                {
                  label: saved ? 'Remove from Watch Later' : 'Save to Watch Later',
                  icon: saved ? <BookmarkCheckIcon className="size-3.5" /> : <BookmarkIcon className="size-3.5" />,
                  onSelect: () => void window.api.toggleSaved(savedVideo(channel, m))
                }
              ])
            }}
            hasMore={Boolean(page?.cursors[tab])}
            loadingMore={loadingMore === tab}
            onLoadMore={() => void loadMore(tab)}
          />
        )}
      </div>

      {playing && <PlayerModal channel={channel} item={playing} onClose={() => setPlaying(null)} />}
      {menu.element}
      {videoMenu.element}
    </div>
  )
}

/** On refresh, keep pages already loaded via "Load more" (new items first, then what was loaded). */
function mergeLoaded(prev: ChannelPageData, next: ChannelPageData): Partial<ChannelPageData> {
  const merge = (a: MediaItem[], b: MediaItem[]): MediaItem[] => {
    const ids = new Set(b.map((m) => m.id))
    return [...b, ...a.filter((m) => !ids.has(m.id))]
  }
  const grew = (c: MediaCategory): boolean => prev[c].length > next[c].length
  return {
    streams: merge(prev.streams, next.streams),
    videos: merge(prev.videos, next.videos),
    clips: merge(prev.clips, next.clips),
    cursors: {
      streams: grew('streams') ? prev.cursors.streams : next.cursors.streams,
      videos: grew('videos') ? prev.cursors.videos : next.cursors.videos,
      clips: grew('clips') ? prev.cursors.clips : next.cursors.clips
    }
  }
}

function ClipFilter({
  sort,
  onSort,
  window: win,
  onWindow
}: {
  sort: 'newest' | 'oldest'
  onSort(v: 'newest' | 'oldest'): void
  window: ClipWindow
  onWindow(v: ClipWindow): void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close, true)
    return () => document.removeEventListener('pointerdown', close, true)
  }, [open])
  const item = (label: string, checked: boolean, onSelect: () => void): React.JSX.Element => (
    <button key={label} onClick={onSelect} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-regular text-primary hover:bg-accent hover:text-white">
      <span className="flex w-4 justify-center">{checked && <CheckIcon className="size-3.5" strokeWidth={2.5} />}</span>
      {label}
    </button>
  )
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Sort & filter"
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-control px-3 ring-1 ring-separator transition-colors hover:bg-control-active"
      >
        <ArrowUpDownIcon className="size-4 shrink-0 text-secondary" />
        <span className="text-small-strong text-primary">
          {sort === 'newest' ? 'Newest' : 'Oldest'}
          {win !== 'all' ? ` · ${CLIP_WINDOW_LABEL[win]}` : ''}
        </span>
      </button>
      {open && (
        <div className="absolute top-10 right-0 z-40 w-52 rounded-popover bg-popover p-1 shadow-2xl ring-1 ring-separator">
          <p className="px-2 pt-1 pb-0.5 text-small-strong text-tertiary">Sort by date</p>
          {item('Newest first', sort === 'newest', () => onSort('newest'))}
          {item('Oldest first', sort === 'oldest', () => onSort('oldest'))}
          <div className="mx-2 my-1 h-px bg-separator" />
          <p className="px-2 pt-1 pb-0.5 text-small-strong text-tertiary">Created within</p>
          {(['24h', '7d', '30d'] as const).map((w) => item(CLIP_WINDOW_LABEL[w], win === w, () => onWindow(win === w ? 'all' : w)))}
          {item('Any time', win === 'all', () => onWindow('all'))}
        </div>
      )}
    </div>
  )
}

function MediaGrid({
  items,
  loading,
  portrait,
  emptyText,
  platform,
  onPlay,
  onContextMenu,
  hasMore,
  loadingMore,
  onLoadMore
}: {
  items: MediaItem[]
  loading: boolean
  portrait: boolean
  emptyText: string
  platform: Channel['platform']
  onPlay(m: MediaItem): void
  onContextMenu(e: React.MouseEvent, m: MediaItem): void
  hasMore: boolean
  loadingMore: boolean
  onLoadMore(): void
}): React.JSX.Element {
  const progress = useVodProgress((s) => s.entries)
  const cols = portrait ? '[grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]' : '[grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]'
  const aspect = portrait ? 'aspect-[9/16]' : 'aspect-video'

  if (loading) {
    return (
      <div className={`grid ${cols} gap-x-4 gap-y-5`}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className={`${aspect} w-full animate-pulse rounded-lg bg-control-subtle`} />
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-control-subtle" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-control-subtle" />
          </div>
        ))}
      </div>
    )
  }
  if (items.length === 0) return <p className="py-8 text-center text-regular text-tertiary">{emptyText}</p>

  return (
    <div className={`grid ${cols} gap-x-4 gap-y-5`}>
      {items.map((m) => {
        const fraction = progressFraction(progress, progressKey(platform, m.id))
        return (
          <button key={m.id} type="button" onClick={() => onPlay(m)} onContextMenu={(e) => onContextMenu(e, m)} className="group flex flex-col gap-2 text-left outline-none">
            <div className={`relative ${aspect} w-full overflow-hidden rounded-lg bg-control-subtle ring-1 ring-separator transition-shadow group-hover:ring-secondary`}>
              <Thumbnail src={m.thumbnail} />
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                <span className="flex size-11 items-center justify-center rounded-full bg-black/60 opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100">
                  <PlayIcon className="ml-0.5 size-5 fill-white text-white" />
                </span>
              </div>
              {m.durationText && (
                <span className="absolute right-1.5 bottom-1.5 rounded bg-black/80 px-1.5 py-0.5 text-small font-medium text-white tabular-nums">{m.durationText}</span>
              )}
              {fraction !== null && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                  <div className="h-full bg-accent" style={{ width: `${Math.round(fraction * 100)}%` }} />
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="line-clamp-2 text-small-strong leading-snug text-primary">{m.title}</span>
              {(m.viewCountText || m.publishedText) && (
                <span className="truncate text-small text-tertiary">{[m.viewCountText, m.publishedText].filter(Boolean).join(' · ')}</span>
              )}
            </div>
          </button>
        )
      })}
      {hasMore && (
        <div className="col-span-full flex justify-center pt-2">
          <Button onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? (
              <>
                <Loader2Icon className="size-3.5 animate-spin" />
                Loading…
              </>
            ) : (
              'Load more'
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Centered player over a blurred backdrop; resumes where you left off and keeps saving progress. */
function PlayerModal({ channel, item, onClose }: { channel: Channel; item: MediaItem; onClose(): void }): React.JSX.Element {
  const key = progressKey(channel.platform, item.id)
  const [startAt] = useState(() => resumePosition(key))
  const lastTime = useRef(startAt)
  const save = useVodProgress((s) => s.save)
  const onProgress = useCallback(
    (t: number, d: number) => {
      lastTime.current = t
      save(key, t, d)
    },
    [key, save]
  )
  const [hover, setHover] = useState(false)
  const [seek, setSeek] = useState<{ to: number } | undefined>()
  const chapters = useChapters(channel.platform, item.playUrl ? item.id : undefined)
  const short = item.kind === 'short'
  const canPip = item.kind === 'vod' || item.kind === 'video'

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pip = async (): Promise<void> => {
    const url = item.playUrl ?? item.hlsUrl
    if (!url) return
    if (await window.api.openPip({ platform: channel.platform, url, hls: !item.playUrl, startAt: lastTime.current })) onClose()
  }

  return (
    <div role="presentation" onClick={onClose} className="no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-8 backdrop-blur-xl">
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={`relative ${short ? 'aspect-[9/16] h-[min(82vh,760px)]' : 'aspect-video w-[min(90vw,1100px)]'} overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-white/10`}
      >
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="absolute top-2.5 right-2.5 z-20 flex size-8 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/10 backdrop-blur-md transition-colors hover:bg-black/75"
        >
          <XIcon className="size-4 text-white" strokeWidth={2.25} />
        </button>
        {item.playUrl ? (
          <WebView
            key={item.playUrl}
            platform={channel.platform}
            src={withStartTime(item.playUrl, startAt)}
            resumeAt={startAt}
            onProgress={onProgress}
            seek={seek}
            className="size-full"
          />
        ) : item.hlsUrl ? (
          <HlsVideo src={item.hlsUrl} startAt={startAt} onProgress={onProgress} />
        ) : (
          <div className="grid size-full place-items-center text-regular text-tertiary">This video can’t be played here.</div>
        )}
        {(canPip || item.playUrl || item.hlsUrl) && (
          <div className={`absolute top-1/2 right-3 z-20 flex -translate-y-1/2 flex-col gap-2 transition-opacity duration-200 ${hover ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
            {canPip && <button
              type="button"
              onClick={() => void pip()}
              title="Picture in Picture"
              className="flex size-9 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/10 backdrop-blur-md transition-colors hover:bg-black/75"
            >
              <PictureInPicture2Icon className="size-4 text-white" strokeWidth={2.25} />
            </button>}
            <SaveForLaterButton overlay item={savedVideo(channel, item)} />
            <ChaptersButton chapters={chapters} currentTime={() => lastTime.current} onSeek={(to) => setSeek({ to })} buttonClass="flex size-9 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/10 backdrop-blur-md transition-colors hover:bg-black/75" />
          </div>
        )}
      </div>
      <p className="pointer-events-none absolute bottom-6 left-1/2 max-w-[80vw] -translate-x-1/2 truncate text-strong text-white/90 drop-shadow">{item.title}</p>
    </div>
  )
}
