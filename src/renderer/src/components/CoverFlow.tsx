import { useEffect, useRef, useState } from 'react'
import { BookmarkIcon, ChevronLeftIcon, ChevronRightIcon, PlayIcon, RadioIcon } from 'lucide-react'
import type { SavedItem } from '@shared/types'
import { savedTitle } from '../lib/watchLater'
import { PlatformDot } from './platform'
import { Thumbnail } from './Thumbnail'

/**
 * Cover Flow carousel of the Watch Later playlist. The centered cover faces forward and its
 * neighbours angle away (CSS 3D). Click the centered cover (or press Enter) to open the playlist
 * there; click a side cover to bring it to the middle; ←/→ and the scroll wheel move through it.
 */
export function CoverFlow({
  items,
  onOpen,
  textClass,
  shadow
}: {
  items: SavedItem[]
  onOpen(id: string): void
  /** Heading color, matched to the home wallpaper. */
  textClass: string
  shadow: string
}): React.JSX.Element {
  const [center, setCenter] = useState(0)
  const last = items.length - 1

  useEffect(() => setCenter((c) => Math.min(c, Math.max(0, last))), [last])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea')) return
      if (e.key === 'ArrowLeft') setCenter((c) => Math.max(0, c - 1))
      else if (e.key === 'ArrowRight') setCenter((c) => Math.min(last, c + 1))
      else if (e.key === 'Enter' && items[center]) onOpen(items[center].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, center, last, onOpen])

  // One wheel flick moves one cover.
  const lastWheel = useRef(0)
  const onWheel = (e: React.WheelEvent): void => {
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
    if (items.length <= 1 || Math.abs(delta) < 8 || Date.now() - lastWheel.current < 220) return
    lastWheel.current = Date.now()
    setCenter((c) => (delta > 0 ? Math.min(last, c + 1) : Math.max(0, c - 1)))
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-black/25 px-5 py-4 text-white/85 ring-1 ring-white/10 backdrop-blur-md">
        <BookmarkIcon className="size-7 text-white/60" strokeWidth={1.75} />
        <p className="text-regular">Your Watch Later playlist is empty.</p>
        <p className="max-w-sm text-center text-small text-white/65">Press “Save for Later” under any stream, or on a past video, and it’ll show up here.</p>
      </div>
    )
  }

  const active = items[Math.min(center, last)]
  const navButton = 'absolute top-1/2 z-50 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/10 backdrop-blur-md transition-all hover:bg-black/65 disabled:opacity-0'

  return (
    <div className="flex w-full flex-col items-center gap-2 select-none" onWheel={onWheel}>
      <span className={`text-strong ${textClass} ${shadow}`}>Saved · Watch Later</span>

      <div className="relative h-[180px] w-full max-w-3xl [perspective:1200px]">
        <div className="absolute inset-0 flex items-center justify-center [transform-style:preserve-3d]">
          {items.map((item, i) => {
            const offset = i - center
            const abs = Math.abs(offset)
            if (abs > 3) return null
            const isCenter = offset === 0
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => (isCenter ? onOpen(item.id) : setCenter(i))}
                aria-label={isCenter ? `Play ${savedTitle(item)}` : `Show ${savedTitle(item)}`}
                className="absolute aspect-video w-[280px] overflow-hidden rounded-xl bg-control-subtle shadow-2xl ring-1 ring-white/10 transition-[transform,opacity] duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-accent"
                style={{
                  transform: `translateX(${offset * 150}px) rotateY(${isCenter ? 0 : offset > 0 ? -48 : 48}deg) scale(${isCenter ? 1 : 0.82})`,
                  zIndex: 100 - abs,
                  opacity: abs > 2 ? 0.25 : 1
                }}
              >
                <Thumbnail src={item.thumbnail} />
                {item.kind === 'channel' && (
                  <span className="absolute top-1.5 left-1.5 flex h-5 items-center gap-1 rounded-md bg-black/70 px-1.5 text-small font-semibold text-white backdrop-blur-sm">
                    <RadioIcon className="size-3 text-support-red" strokeWidth={2.5} />
                    Stream
                  </span>
                )}
                {isCenter && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <span className="flex size-12 items-center justify-center rounded-full bg-black/60 backdrop-blur-md">
                      <PlayIcon className="ml-0.5 size-6 fill-white text-white" />
                    </span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <button type="button" onClick={() => setCenter((c) => Math.max(0, c - 1))} disabled={center === 0} aria-label="Previous" className={`${navButton} left-1`}>
          <ChevronLeftIcon className="size-5" />
        </button>
        <button type="button" onClick={() => setCenter((c) => Math.min(last, c + 1))} disabled={center >= last} aria-label="Next" className={`${navButton} right-1`}>
          <ChevronRightIcon className="size-5" />
        </button>
      </div>

      {/* Glass chip keeps the label legible over any wallpaper. */}
      <div className="flex min-h-[44px] items-center justify-center">
        <div className="flex max-w-xl flex-col items-center gap-0.5 rounded-2xl bg-black/40 px-3.5 py-1.5 text-center ring-1 ring-white/10 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-1.5">
            <PlatformDot platform={active.platform} />
            <span className="line-clamp-1 text-strong text-white">{savedTitle(active)}</span>
          </div>
          <span className="text-small text-white/70">
            {active.kind === 'vod' ? `${active.displayName} · ` : 'Live stream · '}
            {Math.min(center, last) + 1} / {items.length}
          </span>
        </div>
      </div>
    </div>
  )
}
