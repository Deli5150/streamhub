import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeftIcon,
  GripVerticalIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  PencilIcon,
  PictureInPicture2Icon,
  RadioIcon,
  RectangleHorizontalIcon,
  RefreshCwIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Trash2Icon,
  XIcon,
  Tv2Icon,
  ExternalLinkIcon
} from 'lucide-react'
import type { SavedItem } from '@shared/types'
import { embedUrl } from '@shared/urls'
import { progressFraction, progressKey, resumePosition, useVodProgress, withStartTime } from '../lib/vodProgress'
import { ChaptersButton, useChapters } from './Chapters'
import { useQueue } from '../lib/queue'
import { savedTitle, useWatchLater } from '../lib/watchLater'
import { errorMessage, useTheaterEsc, useUi } from '../store'
import { openPipFor } from './channelMenu'
import { HlsVideo } from './HlsVideo'
import { PLATFORM_META, PlatformDot } from './platform'
import { Thumbnail } from './Thumbnail'
import { Button } from './ui'
import { WebView } from './WebView'

const overlayButton =
  'flex size-9 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/10 backdrop-blur-md transition-colors hover:bg-black/75'

/** Watch Later, the video queue, or an imported YouTube playlist (`yt:<playlist id>`, read-only). */
export type PlaylistSource = 'watchLater' | 'queue' | `yt:${string}`

/** Whether an item can play right now (a video, or a saved stream that's live). */
function playable(item: SavedItem, live: Record<string, unknown> | undefined): boolean {
  return item.kind === 'vod' ? Boolean(item.media?.playUrl || item.media?.hlsUrl) : Boolean(live?.[item.channelKey])
}

const NO_ITEMS: SavedItem[] = []
const ytPlaylistId = (source: PlaylistSource): string | null => (source.startsWith('yt:') ? source.slice(3) : null)

/** The list a PlaylistView plays, with its edit operations (none for an imported playlist). */
function usePlaylist(source: PlaylistSource): {
  title: string
  items: SavedItem[]
  editable: boolean
  remove(id: string): void
  reorder(sourceId: string, targetId: string): void
} {
  const saved = useWatchLater()
  const queue = useQueue()
  const ytId = ytPlaylistId(source)
  const imported = useUi((s) => (ytId ? s.app?.ytPlaylists?.find((p) => p.id === ytId) : undefined))
  if (ytId) return { title: imported?.title ?? 'Playlist', items: imported?.items ?? NO_ITEMS, editable: false, remove: () => {}, reorder: () => {} }
  return source === 'queue'
    ? { title: 'Queue', items: queue.items, editable: true, remove: queue.remove, reorder: queue.reorder }
    : { title: 'Saved · Watch Later', items: saved, editable: true, remove: (id) => void window.api.removeSaved(id), reorder: (a, b) => void window.api.reorderSaved(a, b) }
}

/**
 * YouTube-style playlist view, for Watch Later, the video queue and imported YouTube playlists: the
 * selected item plays on the left and the whole list sits on the right (click to switch, drag to
 * reorder, Edit to delete). When a video finishes, the next playable item starts. The list can be
 * hidden and brought back, and theater mode gives the video the whole window.
 */
export function PlaylistView({ source = 'watchLater', startId }: { source?: PlaylistSource; startId?: string }): React.JSX.Element | null {
  const { title, items, editable, remove, reorder } = usePlaylist(source)
  const ytId = ytPlaylistId(source)
  const { app, go } = useUi()
  const theater = useUi((s) => s.theater)
  useTheaterEsc(theater)
  const [refreshing, setRefreshing] = useState(false)
  const refresh = (): void => {
    if (!ytId) return
    setRefreshing(true)
    window.api
      .refreshYouTubePlaylist(ytId)
      .catch((e) => useUi.getState().showToast({ text: `Couldn't refresh: ${errorMessage(e)}` }))
      .finally(() => setRefreshing(false))
  }
  const pip = useUi((s) => s.pip)
  const [activeId, setActiveIdState] = useState<string | null>(
    () => startId ?? (source === 'queue' ? useQueue.getState().activeId : null) ?? items[0]?.id ?? null
  )
  // The queue remembers what was playing, so returning to it picks up there.
  const setActiveId = useCallback(
    (id: string | null) => {
      setActiveIdState(id)
      if (source === 'queue') useQueue.getState().setActive(id)
    },
    [source]
  )
  const [listOpen, setListOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const [hover, setHover] = useState(false)
  // Video popped out to picture-in-picture: the inline player steps aside until PiP closes.
  const [pipId, setPipId] = useState<string | null>(null)

  useEffect(() => {
    if (app && items.length === 0) go({ kind: 'home' })
    else if (items.length && !items.some((i) => i.id === activeId)) {
      // The playing item was removed: the queue already picked the one after it.
      const queued = source === 'queue' ? useQueue.getState().activeId : null
      setActiveId(items.some((i) => i.id === queued) ? queued : items[0].id)
    }
  }, [app, items, activeId, go, setActiveId, source])
  useEffect(() => {
    if (pip === null) setPipId(null)
  }, [pip])
  useEffect(() => setPipId(null), [activeId])

  const index = items.findIndex((i) => i.id === activeId)
  const active = items[index] ?? items[0]
  const step = useCallback(
    (by: number) => {
      const next = items[index + by]
      if (next) setActiveId(next.id)
    },
    [items, index, setActiveId]
  )
  const liveNow = app?.live
  // A finished video moves on to the next one that can play (skipping saved streams that are offline).
  const playNext = useCallback(() => {
    const next = items.slice(index + 1).find((i) => playable(i, liveNow))
    if (next) setActiveId(next.id)
  }, [items, index, liveNow, setActiveId])
  // Last position of the playing video, so PiP picks up where the inline player was.
  const lastTime = useRef(0)
  const [seek, setSeek] = useState<{ to: number } | undefined>()
  useEffect(() => {
    // A new item starts fresh (no pending chapter jump, no old position).
    setSeek(undefined)
    lastTime.current = 0
  }, [activeId])
  const activeItem = items[index] ?? items[0]
  const chapters = useChapters(activeItem?.platform ?? 'youtube', activeItem?.kind === 'vod' && activeItem.media?.playUrl ? activeItem.media.id : undefined)

  if (!active) return null
  const followed = app?.channels.find((c) => c.key === active.channelKey)
  const live = app?.live[active.channelKey]
  const inPip = pipId === active.id && pip !== null
  const canPip = active.kind === 'vod' ? Boolean(active.media?.playUrl || active.media?.hlsUrl) : Boolean(followed && live && embedUrl(followed, live))

  const popOut = async (): Promise<void> => {
    if (active.kind === 'channel') {
      if (followed && live) openPipFor(followed, live)
      return
    }
    const url = active.media?.playUrl ?? active.media?.hlsUrl
    if (url && (await window.api.openPip({ platform: active.platform, url, hls: !active.media?.playUrl, startAt: lastTime.current }))) setPipId(active.id)
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-2 pr-0">
        <div
          className="relative overflow-hidden rounded-panel bg-black ring-1 ring-separator"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {inPip ? (
            <div className={`flex ${playerBox(theater)} flex-col items-center justify-center gap-3 text-center`}>
              <PictureInPicture2Icon className="size-10 text-white/70" strokeWidth={1.5} />
              <p className="text-strong text-white">Playing in Picture-in-Picture</p>
              <button
                type="button"
                onClick={() => void window.api.closePip()}
                className="flex h-8 items-center rounded-full bg-white/15 px-3.5 text-small-strong text-white ring-1 ring-white/20 transition-colors hover:bg-white/25"
              >
                Bring video back
              </button>
            </div>
          ) : (
            <PlaylistPlayer key={active.id} item={active} theater={theater} onEnded={playNext} onTime={(t) => (lastTime.current = t)} seek={seek} />
          )}
          <div
            className={`absolute top-1/2 right-3 z-20 flex -translate-y-1/2 flex-col gap-2 transition-opacity duration-200 ${
              hover && !inPip ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            {canPip && (
              <button type="button" onClick={() => void popOut()} title="Picture in Picture" className={overlayButton}>
                <PictureInPicture2Icon className="size-4 text-white" strokeWidth={2.25} />
              </button>
            )}
            <ChaptersButton chapters={chapters} currentTime={() => lastTime.current} onSeek={(to) => setSeek({ to })} buttonClass={overlayButton} />
          </div>
          {!listOpen && !theater && (
            <button type="button" onClick={() => setListOpen(true)} title="Show playlist" className={`absolute top-3 right-3 z-20 ${overlayButton} size-8`}>
              <PanelRightOpenIcon className="size-4 text-white" strokeWidth={2.25} />
            </button>
          )}
        </div>

        <div className="flex items-start gap-3 px-2 py-4">
          <Button variant="plain" onClick={() => go({ kind: 'home' })} title="Back to home" className="mt-0.5">
            <ArrowLeftIcon className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="line-clamp-2 text-heading2 text-primary">
              {active.kind === 'channel' ? live?.title || active.title || active.displayName : savedTitle(active)}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-regular text-tertiary">
              <PlatformDot platform={active.platform} />
              {active.displayName}
              {active.kind === 'channel' && (
                <>
                  <span className="text-quaternary">·</span>
                  {live ? <span className="text-support-red">Live now</span> : 'Stream ended'}
                </>
              )}
              <span className="text-quaternary">·</span>
              <span className="tabular-nums">
                {index + 1} of {items.length}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="plain" onClick={() => step(-1)} disabled={index <= 0} title="Previous">
              <SkipBackIcon className="size-3.5" />
            </Button>
            <Button variant="plain" onClick={() => step(1)} disabled={index >= items.length - 1} title="Next">
              <SkipForwardIcon className="size-3.5" />
            </Button>
            <Button
              variant="plain"
              onClick={() => useUi.getState().set({ theater: !theater })}
              title={theater ? 'Exit theater mode (Esc)' : 'Theater mode: hide the sidebar and list'}
              aria-pressed={theater}
              className={theater ? 'bg-control text-primary' : undefined}
            >
              <RectangleHorizontalIcon className="size-3.5" />
            </Button>
            {followed || !ytId ? (
              <Button
                onClick={() => go({ kind: 'watch', key: active.channelKey, offline: true })}
                disabled={!followed}
                title={followed ? `${active.displayName}'s past streams and videos` : "You don't follow this channel anymore"}
              >
                <Tv2Icon className="size-3.5" strokeWidth={2.25} />
                Go to channel
              </Button>
            ) : (
              <Button onClick={() => void window.api.openExternal(`https://www.youtube.com/watch?v=${active.media?.id}&list=${ytId}`)} title="Open this video on YouTube">
                <ExternalLinkIcon className="size-3.5" strokeWidth={2.25} />
                Open on YouTube
              </Button>
            )}
          </div>
        </div>
      </div>

      {listOpen && !theater && (
        <div className="flex w-[340px] shrink-0 flex-col p-2">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel bg-well ring-1 ring-separator">
            <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-separator pr-1.5 pl-3">
              <span className="min-w-0 truncate text-small-strong text-primary">
                {title} <span className="text-tertiary tabular-nums">({items.length})</span>
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {source === 'queue' && (
                  <button
                    type="button"
                    onClick={() => useQueue.getState().clear()}
                    title="Clear the queue"
                    className="flex h-7 items-center gap-1 rounded-full px-2.5 text-small-strong text-secondary transition-colors hover:bg-control"
                  >
                    <XIcon className="size-3.5" />
                    Clear
                  </button>
                )}
                {ytId && (
                  <button
                    type="button"
                    onClick={refresh}
                    disabled={refreshing}
                    title="Get the playlist's latest videos from YouTube"
                    className="flex h-7 items-center gap-1 rounded-full px-2.5 text-small-strong text-secondary transition-colors hover:bg-control disabled:opacity-50"
                  >
                    <RefreshCwIcon className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                )}
                {editable && (
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  title={editing ? 'Done' : 'Edit — delete items'}
                  className={`flex h-7 items-center gap-1 rounded-full px-2.5 text-small-strong transition-colors ${
                    editing ? 'bg-accent text-white' : 'text-secondary hover:bg-control'
                  }`}
                >
                  {!editing && <PencilIcon className="size-3.5" />}
                  {editing ? 'Done' : 'Edit'}
                </button>
                )}
                <button type="button" onClick={() => setListOpen(false)} title="Hide playlist" className="flex size-7 items-center justify-center rounded-full transition-colors hover:bg-control">
                  <PanelRightCloseIcon className="size-4 text-secondary" />
                </button>
              </div>
            </div>
            <PlaylistList items={items} activeId={active.id} editing={editing} reorderable={editable} onPick={setActiveId} onRemove={remove} onReorder={reorder} />
          </div>
        </div>
      )}
    </div>
  )
}

/** Playlist items, drag to reorder (when `reorderable`). */
function PlaylistList({
  items,
  activeId,
  editing,
  reorderable,
  onPick,
  onRemove,
  onReorder
}: {
  items: SavedItem[]
  activeId: string
  editing: boolean
  reorderable: boolean
  onPick(id: string): void
  onRemove(id: string): void
  onReorder(sourceId: string, targetId: string): void
}): React.JSX.Element {
  const progress = useVodProgress((s) => s.entries)
  const live = useUi((s) => s.app?.live)
  // The dragged id lives in a ref so drop reads it synchronously; state only drives the styling.
  const dragRef = useRef<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const endDrag = (): void => {
    dragRef.current = null
    setDragId(null)
    setOverId(null)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-1">
      {items.map((item) => {
        const fraction = item.media ? progressFraction(progress, progressKey(item.platform, item.media.id)) : null
        const isLive = item.kind === 'channel' && Boolean(live?.[item.channelKey])
        return (
          <div
            key={item.id}
            draggable={reorderable}
            onDragStart={(e) => {
              dragRef.current = item.id
              setDragId(item.id)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', item.id)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              if (overId !== item.id) setOverId(item.id)
            }}
            onDrop={(e) => {
              e.preventDefault()
              const src = dragRef.current || e.dataTransfer.getData('text/plain')
              if (src && src !== item.id) onReorder(src, item.id)
              endDrag()
            }}
            onDragEnd={endDrag}
            onClick={() => !editing && onPick(item.id)}
            className={`group relative flex items-center gap-2 border-t-2 px-2 py-1.5 transition-colors ${
              overId === item.id && dragId && dragId !== item.id ? 'border-accent' : 'border-transparent'
            } ${dragId === item.id ? 'opacity-50' : ''} ${editing ? '' : 'cursor-pointer'} ${item.id === activeId ? 'bg-control' : 'hover:bg-control-subtle'}`}
          >
            {reorderable && <GripVerticalIcon className="size-4 shrink-0 cursor-grab text-tertiary" aria-hidden="true" />}
            <div className="relative aspect-video w-[88px] shrink-0 overflow-hidden rounded bg-control-subtle ring-1 ring-separator">
              <Thumbnail src={item.thumbnail} className="[&_svg]:size-5" />
              {item.media?.durationText && (
                <span className="absolute right-0.5 bottom-1 rounded bg-black/80 px-1 text-[10px] font-medium text-white tabular-nums">{item.media.durationText}</span>
              )}
              {isLive && <span className="absolute top-0.5 left-0.5 rounded bg-support-red px-1 text-[9px] font-bold text-white">LIVE</span>}
              {fraction !== null && (
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-black/50">
                  <div className="h-full bg-accent" style={{ width: `${Math.round(fraction * 100)}%` }} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span className="line-clamp-2 text-small-strong leading-snug text-primary">{savedTitle(item)}</span>
              <span className="flex items-center gap-1 text-small text-tertiary">
                <PlatformDot platform={item.platform} />
                <span className="truncate">{item.kind === 'vod' ? item.displayName : 'Live stream'}</span>
              </span>
            </div>
            {editing && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(item.id)
                }}
                title="Delete from playlist"
                aria-label={`Delete ${savedTitle(item)} from playlist`}
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-support-red/10 transition-colors hover:bg-support-red/20"
              >
                <Trash2Icon className="size-3.5 text-support-red" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Plays a saved video (resuming and saving progress), or a saved channel's stream while it's live. */
/** The player's frame: 16:9, as wide as fits, a little taller in theater mode (as for live streams). */
const playerBox = (theater: boolean): string => `aspect-video w-full ${theater ? 'max-h-[calc(100vh-150px)]' : 'max-h-[calc(100vh-190px)]'}`

function PlaylistPlayer({
  item,
  theater,
  onEnded,
  onTime,
  seek
}: {
  item: SavedItem
  theater: boolean
  onEnded(): void
  onTime(t: number): void
  seek?: { to: number }
}): React.JSX.Element {
  const app = useUi((s) => s.app)
  const save = useVodProgress((s) => s.save)
  const key = item.media ? progressKey(item.platform, item.media.id) : ''
  const [startAt] = useState(() => (key ? resumePosition(key) : 0))
  const onProgress = useCallback(
    (t: number, d: number) => {
      onTime(t)
      save(key, t, d)
    },
    [key, save, onTime]
  )
  const box = playerBox(theater)

  if (item.media?.playUrl) {
    return (
      <WebView
        platform={item.platform}
        src={withStartTime(item.media.playUrl, startAt)}
        resumeAt={startAt}
        onProgress={onProgress}
        onEnded={onEnded}
        seek={seek}
        className={box}
      />
    )
  }
  if (item.media?.hlsUrl) {
    return (
      <div className={box}>
        <HlsVideo src={item.media.hlsUrl} startAt={startAt} onProgress={onProgress} onEnded={onEnded} />
      </div>
    )
  }

  const channel = app?.channels.find((c) => c.key === item.channelKey)
  const live = app?.live[item.channelKey]
  const url = channel && live ? embedUrl(channel, live) : null
  if (channel && url) return <WebView key={url} platform={channel.platform} src={url} className={box} />

  return (
    <div className={`${box} flex flex-col items-center justify-center gap-2 px-6 text-center`}>
      <RadioIcon className="size-10 text-white/40" strokeWidth={1.5} />
      <p className="text-regular text-white/85">{item.displayName} isn’t live right now.</p>
      <p className="max-w-md text-small text-white/55">
        {item.kind === 'channel'
          ? `This entry turns into the stream's recording once ${PLATFORM_META[item.platform].label} publishes it. Pick another item from the playlist meanwhile.`
          : 'This video can’t be played here.'}
      </p>
    </div>
  )
}
