import { useEffect, type ReactNode } from 'react'
import type { Channel, MediaItem, Platform } from '@shared/types'
import { dispatch, useBp, type PadStyle } from '../../lib/bigPicture'
import type { NewSavedItem } from '../../lib/watchLater'
import { formatViewers } from '../../store'
import { ChannelAvatar } from '../ChannelAvatar'
import { PLATFORM_META } from '../platform'
import { Thumbnail } from '../Thumbnail'

// Building blocks of Big Picture mode: focusable tiles (they grow and get a white outline when
// focused), titled rows that scroll sideways, and the controller button hints along the bottom.

/** Look of every focusable thing: lifts and gets a white ring when focused. */
export const FOCUS =
  'outline-none transition-[transform,box-shadow,background-color] duration-150 ease-out focus:z-10 focus:scale-[1.045] focus:shadow-[0_0_0_4px_#fff,0_24px_60px_rgba(0,0,0,0.55)]'

/** A pill button (screen actions, player controls). */
export function BpButton({
  id,
  icon,
  children,
  onPress,
  autoFocus,
  active,
  title
}: {
  id?: string
  icon?: ReactNode
  children?: ReactNode
  onPress(): void
  autoFocus?: boolean
  /** Shown as selected (e.g. the current tab or stream source). */
  active?: boolean
  title?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      data-bp=""
      data-bp-id={id}
      data-bp-autofocus={autoFocus ? '' : undefined}
      onClick={onPress}
      title={title}
      aria-pressed={active}
      className={`${FOCUS} flex h-14 shrink-0 items-center gap-3 rounded-full text-[19px] font-semibold ring-1 ring-white/15 backdrop-blur-xl focus:bg-white focus:text-black focus:ring-0 ${
        active ? 'bg-white/35 text-white' : 'bg-white/15 text-white'
      } ${children ? 'px-7' : 'w-14 justify-center'}`}
    >
      {icon}
      {children}
    </button>
  )
}

/** What the Y menu (BigPicture.tsx) offers for a card: save it, queue it, or open its channel. */
export interface CardMenu {
  item: NewSavedItem
  title: string
}

/** Menus of the cards on screen, by their `data-bp-id`. */
const menus = new Map<string, CardMenu>()
export const cardMenu = (id: string | undefined): CardMenu | undefined => (id ? menus.get(id) : undefined)

/** A titled row of tiles that scrolls sideways as focus moves along it. */
export function Row({ title, count, children }: { title: string; count?: number; children: ReactNode }): React.JSX.Element {
  return (
    <section className="mb-10">
      <h2 className="mb-4 px-16 text-[26px] font-bold tracking-tight text-white">
        {title}
        {count !== undefined && <span className="ml-3 text-white/45 tabular-nums">{count}</span>}
      </h2>
      <div data-bp-row="" className="flex gap-6 overflow-x-auto px-16 py-4 [scrollbar-width:none]">
        {children}
      </div>
    </section>
  )
}

const platformChip = (p: Platform): React.JSX.Element => {
  const meta = PLATFORM_META[p]
  return (
    <span className={`flex size-7 items-center justify-center rounded-full ${meta.activeBg} text-white ring-2 ring-black/40`}>
      <meta.Icon className="size-3.5" strokeWidth={2.5} />
    </span>
  )
}

/** A 16:9 card: a live stream or a video, with its title and channel underneath. */
export function VideoCard({
  id,
  thumbnail,
  title,
  subtitle,
  channel,
  platforms,
  live,
  viewers,
  badge,
  progress,
  onPress,
  onFocus,
  menu,
  size = 'md'
}: {
  id: string
  thumbnail?: string
  title: string
  subtitle?: string
  channel?: { name: string; avatarUrl?: string }
  platforms?: Platform[]
  live?: boolean
  viewers?: number
  /** Bottom-right corner text (duration). */
  badge?: string
  /** 0–1 watched. */
  progress?: number | null
  onPress(): void
  onFocus?(): void
  /** Y (or right-click) opens a menu for it. */
  menu?: CardMenu
  size?: 'md' | 'lg'
}): React.JSX.Element {
  useEffect(() => {
    if (!menu) return
    menus.set(id, menu)
    return () => {
      if (menus.get(id) === menu) menus.delete(id)
    }
  }, [id, menu])
  return (
    <button
      type="button"
      data-bp=""
      data-bp-id={id}
      onClick={onPress}
      onFocus={onFocus}
      onContextMenu={(e) => {
        if (!menu) return
        e.preventDefault()
        e.currentTarget.focus({ preventScroll: true })
        dispatch('y')
      }}
      className={`group ${FOCUS} flex shrink-0 flex-col rounded-2xl text-left focus:bg-white/10 ${size === 'lg' ? 'w-[min(30vw,480px)]' : 'w-[min(22vw,360px)]'}`}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-white/8">
        <Thumbnail src={thumbnail} />
        {live && (
          <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-md bg-[#e5242c] px-2 py-0.5 text-[13px] font-bold tracking-wide text-white">
            LIVE{viewers !== undefined && <span className="font-semibold tabular-nums">· {formatViewers(viewers)}</span>}
          </span>
        )}
        {badge && <span className="absolute right-3 bottom-3 rounded-md bg-black/75 px-2 py-0.5 text-[14px] font-semibold text-white tabular-nums">{badge}</span>}
        {platforms && platforms.length > 0 && <span className="absolute top-3 right-3 flex -space-x-1.5">{platforms.map((p) => <span key={p}>{platformChip(p)}</span>)}</span>}
        {progress != null && progress > 0 && (
          <span className="absolute inset-x-0 bottom-0 h-1.5 bg-white/25">
            <span className="block h-full bg-[#e5242c]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
      </div>
      <div className="flex gap-3 px-2 pt-3 pb-2">
        {channel && <ChannelAvatar src={channel.avatarUrl} name={channel.name} className="size-11 shrink-0 rounded-full bg-white/10 object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[18px] leading-snug font-semibold text-white">{title}</p>
          {(channel || subtitle) && <p className="mt-1 truncate text-[15px] text-white/60">{[channel?.name, subtitle].filter(Boolean).join(' · ')}</p>}
        </div>
      </div>
    </button>
  )
}

/** A round channel tile (Following, search): one per channel, or per combined channel with each member's platform. */
export function ChannelTile({ id, channel, platforms, live, onPress }: { id: string; channel: Channel; platforms: Platform[]; live: boolean; onPress(): void }): React.JSX.Element {
  return (
    <button
      type="button"
      data-bp=""
      data-bp-id={`ch:${id}`}
      onClick={onPress}
      className={`${FOCUS} flex flex-col items-center gap-3 rounded-3xl p-5 focus:bg-white/12`}
    >
      <span className={`relative rounded-full p-1 ${live ? 'ring-4 ring-[#e5242c]' : ''}`}>
        <ChannelAvatar src={channel.avatarUrl} name={channel.displayName} className="size-28 rounded-full bg-white/10 object-cover" fallbackTextClassName="text-[36px] font-semibold text-white/70" />
        <span className="absolute -right-1 -bottom-1 flex -space-x-2">
          {platforms.map((p) => (
            <span key={p}>{platformChip(p)}</span>
          ))}
        </span>
      </span>
      <span className="w-full truncate text-center text-[17px] font-semibold text-white">{channel.displayName}</span>
      {live ? <span className="-mt-2 text-[13px] font-bold tracking-wide text-[#ff5a5f]">LIVE</span> : <span className="-mt-2 text-[13px] text-transparent">·</span>}
    </button>
  )
}

/** "1:02:03" for a video's length, from its own text or seconds. */
export const mediaBadge = (m: MediaItem): string | undefined => m.durationText

// ---------- Button hints ----------

const GLYPHS: Record<PadStyle, Record<string, ReactNode>> = {
  xbox: { A: 'A', B: 'B', X: 'X', Y: 'Y' },
  playstation: { A: '✕', B: '○', X: '□', Y: '△' }
}
const GLYPH_COLORS: Record<string, string> = { A: 'bg-[#3fae49]', B: 'bg-[#e0372f]', X: 'bg-[#2f7de1]', Y: 'bg-[#e8b417]' }

export type Hint = [button: 'A' | 'B' | 'X' | 'Y' | 'LB/RB' | 'LT/RT', label: string]

/** The controller's buttons and what they do here (keyboard keys when no controller is connected). */
export function Hints({ hints }: { hints: Hint[] }): React.JSX.Element {
  const pad = useBp((s) => s.pad)
  const keys: Record<string, string> = { A: 'Enter', B: 'Esc', X: 'X', Y: 'Y', 'LB/RB': 'Q / E', 'LT/RT': '' }
  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-2 text-[16px] font-semibold text-white/80">
      {hints
        .filter(([b]) => pad || keys[b])
        .map(([button, label]) => (
          <span key={button + label} className="flex items-center gap-2.5 whitespace-nowrap">
            {pad && GLYPHS[pad][button] !== undefined ? (
              <span className={`flex size-8 items-center justify-center rounded-full text-[15px] font-bold text-white ${pad === 'xbox' ? GLYPH_COLORS[button] : 'bg-white/20'}`}>
                {GLYPHS[pad][button]}
              </span>
            ) : (
              <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-white/18 px-2 text-[14px] font-bold text-white">
                {pad ? button : keys[button]}
              </span>
            )}
            {label}
          </span>
        ))}
    </div>
  )
}
