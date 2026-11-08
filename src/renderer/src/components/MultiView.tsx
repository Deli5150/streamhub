import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckIcon,
  GripVerticalIcon,
  HeadphonesIcon,
  LayoutGridIcon,
  MessageSquareIcon,
  PanelLeftCloseIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SlidersHorizontalIcon,
  SlidersVerticalIcon,
  Trash2Icon,
  Volume2Icon,
  VolumeXIcon,
  XIcon
} from 'lucide-react'
import type { Channel } from '@shared/types'
import { chatUrl, embedUrl } from '@shared/urls'
import { MAX_MULTI, useChannel, useUi } from '../store'
import { ChannelAvatar } from './ChannelAvatar'
import { PlatformDot } from './platform'
import { ChatPanel } from './Watch'
import { Button, EmptyState, Slider, useContextMenu } from './ui'
import { WebView } from './WebView'

/** Per-tile audio, independent per stream. */
type TileAudio = { volume: number; muted: boolean }

/** Two rows of ceil(n/2) columns (one row for a single stream), like the Glaze app. */
function rowsFor<T>(items: T[]): { rows: T[][]; cols: number } {
  if (items.length <= 1) return { rows: [items], cols: 1 }
  const cols = Math.ceil(items.length / 2)
  return { rows: [items.slice(0, cols), items.slice(cols)].filter((r) => r.length), cols }
}

export function MultiView(): React.JSX.Element {
  const { app, multi, focused, collapsed, set, removeFromMulti, setMulti, reorderMulti } = useUi()
  const { channel: focusedChannel, live: focusedLive } = useChannel(focused)
  const [editing, setEditing] = useState(false)

  // Audio: the focused tile starts unmuted and the rest muted, so a new grid isn't a wall of sound.
  // Streams start at the master level; moving the master sets every stream to it.
  const [master, setMaster] = useState(100)
  const [mix, setMix] = useState<Record<string, TileAudio>>({})
  const audioFor = useCallback((key: string): TileAudio => mix[key] ?? { volume: master / 100, muted: key !== focused }, [mix, focused, master])
  /** Sets every stream's volume to the master level (mute and solo stay as they are). */
  const setAll = (pct: number): void => {
    setMaster(pct)
    setMix((m) => Object.fromEntries(multi.map((k) => [k, { ...(m[k] ?? audioFor(k)), volume: pct / 100 }])))
  }
  const setTile = (key: string, next: Partial<TileAudio>): void => setMix((m) => ({ ...m, [key]: { ...audioFor(key), ...next } }))
  const solo = (key: string): void =>
    setMix((m) => {
      const onlyThis = multi.every((k) => (k === key ? !audioFor(k).muted : audioFor(k).muted))
      return Object.fromEntries(multi.map((k) => [k, { volume: (m[k] ?? audioFor(k)).volume, muted: onlyThis ? false : k !== key }]))
    })

  const [nonce, setNonce] = useState<Record<string, number>>({})
  const refresh = (key: string): void => setNonce((n) => ({ ...n, [key]: (n[key] ?? 0) + 1 }))

  // Drag to reorder (edit mode).
  const dragRef = useRef<string | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const endDrag = (): void => {
    dragRef.current = null
    setDragKey(null)
    setOverKey(null)
  }

  useEffect(() => {
    if (multi.length === 0) setEditing(false)
  }, [multi.length])

  const channels = multi.map((k) => app?.channels.find((c) => c.key === k)).filter((c): c is Channel => Boolean(c))
  const { rows, cols } = rowsFor(channels)

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-separator px-4">
          {!collapsed && channels.length > 0 && (
            <Button variant="plain" onClick={() => set({ collapsed: true })} title="Collapse sidebar for more room">
              <PanelLeftCloseIcon className="size-4 text-secondary" strokeWidth={2.25} />
            </Button>
          )}
          <span className="flex-1 truncate text-strong text-primary">
            Multi-view · {channels.length} stream{channels.length === 1 ? '' : 's'}
          </span>
          {editing && (
            <Button
              variant="filled"
              onClick={() => set({ multiPicker: multi })}
              disabled={channels.length >= MAX_MULTI}
              title={channels.length >= MAX_MULTI ? `Maximum of ${MAX_MULTI} streams` : 'Add streams'}
            >
              <PlusIcon className="size-3.5 text-secondary" />
              Add streams
            </Button>
          )}
          {editing && channels.length > 0 && (
            <Button variant="filled" onClick={() => setMulti([])}>
              <Trash2Icon className="size-3.5 text-support-red" />
              Clear all
            </Button>
          )}
          {!editing && channels.length > 0 && (
            <AudioMixer channels={channels} audioFor={audioFor} onSet={setTile} onSolo={solo} master={master} onSetAll={setAll} />
          )}
          {channels.length === 0 ? (
            <Button variant="accent" onClick={() => set({ multiPicker: [] })}>
              <PlusIcon className="size-3.5" />
              Choose streams
            </Button>
          ) : (
            <Button variant="plain" onClick={() => setEditing((e) => !e)} title={editing ? 'Done editing' : 'Edit multi-view (add, remove, or reorder)'}>
              {editing ? <CheckIcon className="size-4 text-secondary" /> : <PencilIcon className="size-4 text-secondary" />}
            </Button>
          )}
        </div>

        <div className="relative min-h-0 flex-1 bg-black">
          {channels.length === 0 ? (
            <div className="grid h-full place-items-center">
              <EmptyState
                icon={<LayoutGridIcon className="size-9 text-quaternary" strokeWidth={1.5} />}
                title="Multi-view is empty"
                description={`Choose up to ${MAX_MULTI} live streams to watch side by side, or right-click a live channel and choose “Add to multi-view”.`}
              />
            </div>
          ) : (
            <div className="flex h-full w-full flex-col gap-0.5">
              {rows.map((row, i) => (
                <div key={i} className="flex min-h-0 flex-1 justify-center gap-0.5">
                  {row.map((c) => (
                    <div key={c.key} className="h-full min-w-0 flex-1" style={{ maxWidth: `${100 / cols}%` }}>
                      <Tile
                        channel={c}
                        editing={editing}
                        focused={focused === c.key}
                        audio={audioFor(c.key)}
                        nonce={nonce[c.key] ?? 0}
                        onToggleMute={() => setTile(c.key, { muted: !audioFor(c.key).muted })}
                        onAudioChange={(next) => setTile(c.key, next)}
                        onRefresh={() => refresh(c.key)}
                        onRemove={() => removeFromMulti(c.key)}
                        isDragging={dragKey === c.key}
                        isOver={overKey === c.key && dragKey !== null && dragKey !== c.key}
                        onDragStart={() => {
                          dragRef.current = c.key
                          setDragKey(c.key)
                        }}
                        onDragOver={() => overKey !== c.key && setOverKey(c.key)}
                        onDrop={() => {
                          if (dragRef.current && dragRef.current !== c.key) reorderMulti(dragRef.current, c.key)
                          endDrag()
                        }}
                        onDragEnd={endDrag}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Side chat follows the focused tile (pick one with a tile's Chat button). */}
      {focusedChannel && channels.length > 0 && <ChatPanel channel={focusedChannel} src={chatUrl(focusedChannel, focusedLive)} />}
    </div>
  )
}

function Tile({
  channel,
  editing,
  focused,
  audio,
  nonce,
  onToggleMute,
  onAudioChange,
  onRefresh,
  onRemove,
  isDragging,
  isOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: {
  channel: Channel
  editing: boolean
  focused: boolean
  audio: TileAudio
  nonce: number
  onToggleMute(): void
  /** Volume or mute was changed in the stream's own player; the mixer follows. */
  onAudioChange(next: TileAudio): void
  onRefresh(): void
  onRemove(): void
  isDragging: boolean
  isOver: boolean
  onDragStart(): void
  onDragOver(): void
  onDrop(): void
  onDragEnd(): void
}): React.JSX.Element {
  const { app, focus } = useUi()
  const live = app?.live[channel.key]
  const src = embedUrl(channel, live)
  const menu = useContextMenu()
  const [hover, setHover] = useState(false)

  return (
    <div
      className={`group relative size-full overflow-hidden bg-black ${focused ? 'ring-2 ring-accent ring-inset' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={(e) =>
        menu.open(e, [{ label: 'Refresh stream', icon: <RefreshCwIcon className="size-3.5" />, onSelect: onRefresh }])
      }
    >
      {src ? (
        <WebView
          key={`${src}-${nonce}`}
          platform={channel.platform}
          src={src}
          muted={audio.muted}
          volume={audio.volume}
          onVolumeChange={(volume, muted) => onAudioChange({ volume, muted })}
          className="size-full"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-regular text-tertiary">{channel.displayName} (offline)</div>
      )}

      {/* Header pill */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-1 ring-1 ring-white/10 backdrop-blur-md">
        <ChannelAvatar src={channel.avatarUrl} name={channel.displayName} className="size-4 shrink-0 rounded-full object-cover" fallbackTextClassName="text-[8px] text-white" />
        <span className="max-w-[150px] truncate text-small-strong text-white">{channel.displayName}</span>
        <PlatformDot platform={channel.platform} />
      </div>

      {!editing && (
        <>
          {/* Chat: show this stream's chat in the side panel (the focused tile). */}
          <button
            type="button"
            onClick={() => focus(channel.key)}
            title={focused ? 'Chat is showing in the side panel' : 'Show this chat in the side panel'}
            className={`absolute bottom-2 left-1/2 z-10 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full px-3 ring-1 backdrop-blur-md transition-opacity ${
              focused ? 'bg-accent ring-accent' : 'bg-black/55 ring-white/10 hover:bg-black/75'
            } ${hover ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            <MessageSquareIcon className="size-4 text-white" strokeWidth={2.25} />
            <span className="text-small-strong text-white">{focused ? 'Chatting' : 'Chat'}</span>
          </button>
          {/* Quick mute */}
          <button
            type="button"
            onClick={onToggleMute}
            title={audio.muted ? 'Unmute this stream' : 'Mute this stream'}
            className={`absolute bottom-2 left-2 z-10 flex size-8 items-center justify-center rounded-full ring-1 backdrop-blur-md transition-colors ${
              audio.muted ? 'bg-support-red/85 ring-support-red hover:bg-support-red' : 'bg-black/55 ring-white/10 hover:bg-black/75'
            }`}
          >
            {audio.muted ? <VolumeXIcon className="size-4 text-white" strokeWidth={2.25} /> : <Volume2Icon className="size-4 text-white" strokeWidth={2.25} />}
          </button>
        </>
      )}

      {editing && (
        <>
          {/* Drag overlay covers the webview (which swallows drag events) so the whole tile is a handle. */}
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', channel.key)
              onDragStart()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              onDragOver()
            }}
            onDrop={(e) => {
              e.preventDefault()
              onDrop()
            }}
            onDragEnd={onDragEnd}
            className={`absolute inset-0 z-20 flex items-center justify-center transition-colors ${
              isOver ? 'bg-accent/20 ring-2 ring-accent ring-inset' : 'bg-black/30'
            } ${isDragging ? 'opacity-40' : ''}`}
          >
            <GripVerticalIcon className="size-8 text-white/80" strokeWidth={2} />
          </div>
          <button
            type="button"
            onClick={onRemove}
            title={`Remove ${channel.displayName}`}
            className="absolute top-2 right-2 z-30 flex size-7 items-center justify-center rounded-full bg-support-red shadow-lg ring-2 ring-black/40 transition-colors hover:bg-support-red/90"
          >
            <XIcon className="size-4 text-white" strokeWidth={2.5} />
          </button>
        </>
      )}
      {menu.element}
    </div>
  )
}

/** The mixer's top row: one level for every stream. */
function MasterVolume({ value, matched, onChange }: { value: number; matched: boolean; onChange(pct: number): void }): React.JSX.Element {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-md px-2 py-2 transition-opacity hover:bg-control-subtle ${matched ? '' : 'opacity-45 hover:opacity-80'}`}
      title={matched ? 'Sets every stream to the same volume' : 'Streams are at different volumes. Move this to set them all to one level.'}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-control">
        <SlidersHorizontalIcon className="size-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-small-strong text-primary">All streams</span>
          {!matched && <span className="text-small text-tertiary">· Mixed</span>}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Slider className="flex-1" value={value} onChange={onChange} />
          <span className="w-9 shrink-0 text-right text-small text-tertiary tabular-nums">{value}%</span>
        </div>
      </div>
      {/* Lines up with the per-stream rows' mute and solo buttons. */}
      <div className="w-[74px] shrink-0" />
    </div>
  )
}

function AudioMixer({
  channels,
  audioFor,
  onSet,
  onSolo,
  master,
  onSetAll
}: {
  channels: Channel[]
  audioFor(key: string): TileAudio
  onSet(key: string, next: Partial<TileAudio>): void
  onSolo(key: string): void
  /** Master level, 0–100. */
  master: number
  onSetAll(pct: number): void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <Button variant="plain" onClick={() => setOpen((o) => !o)} title="Audio mixer — set each stream's volume">
        <SlidersVerticalIcon className="size-4 text-secondary" />
      </Button>
      {open && (
        <div className="absolute top-9 right-0 z-40 w-[22rem] rounded-popover bg-popover p-2 shadow-2xl ring-1 ring-separator">
          <div className="px-2 pt-0.5 pb-1">
            <span className="text-small-strong text-secondary">Audio mixer</span>
          </div>
          <MasterVolume
            value={master}
            // Dimmed once any stream is set to its own level (here or in its player).
            matched={channels.every((c) => Math.round(audioFor(c.key).volume * 100) === master)}
            onChange={onSetAll}
          />
          <div className="mx-2 my-1 h-px bg-separator" />
          {channels.map((c) => {
            const a = audioFor(c.key)
            const pct = Math.round(a.volume * 100)
            return (
              <div key={c.key} className="flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-control-subtle">
                <ChannelAvatar src={c.avatarUrl} name={c.displayName} className="size-8 shrink-0 rounded-full bg-control object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-small-strong text-primary">{c.displayName}</span>
                    <PlatformDot platform={c.platform} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Slider className="flex-1" value={pct} onChange={(v) => onSet(c.key, { volume: v / 100, muted: v === 0 })} />
                    <span className="w-9 shrink-0 text-right text-small text-tertiary tabular-nums">{pct}%</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onSet(c.key, { muted: !a.muted })}
                  title={a.muted ? 'Unmute' : 'Mute'}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-control"
                >
                  {a.muted ? <VolumeXIcon className="size-4 text-support-red" /> : <Volume2Icon className="size-4 text-secondary" />}
                </button>
                <button
                  type="button"
                  onClick={() => onSolo(c.key)}
                  title="Solo (mute all others)"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-control"
                >
                  <HeadphonesIcon className="size-4 text-secondary" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
