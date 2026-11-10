import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from 'lucide-react'
import type { Platform } from '@shared/types'
import { PlatformDot } from './platform'
import { Thumbnail } from './Thumbnail'

/** One cover in a CoverFlow. */
export interface Cover {
  id: string
  thumbnail?: string
  title: string
  subtitle: string
  platform?: Platform
  /** Drawn over the cover (a "Stream" tag, a video count). */
  overlay?: ReactNode
}

/**
 * Cover Flow carousel (Home's Watch Later and imported YouTube playlists). The centered cover faces
 * forward and its neighbours angle away (CSS 3D). Click the centered cover (or press Enter) to open
 * it; click a side cover to bring it to the middle; ←/→ and the scroll wheel move through it while
 * the pointer is over it (so two carousels side by side don't both move).
 */
export function CoverFlow({
  label,
  covers,
  onOpen,
  empty
}: {
  label: ReactNode
  covers: Cover[]
  onOpen(id: string): void
  /** Shown instead when there are no covers. */
  empty?: ReactNode
}): React.JSX.Element {
  const [center, setCenter] = useState(0)
  const [hovered, setHovered] = useState(false)
  const last = covers.length - 1

  useEffect(() => setCenter((c) => Math.min(c, Math.max(0, last))), [last])

  useEffect(() => {
    if (!hovered) return
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea')) return
      if (e.key === 'ArrowLeft') setCenter((c) => Math.max(0, c - 1))
      else if (e.key === 'ArrowRight') setCenter((c) => Math.min(last, c + 1))
      else if (e.key === 'Enter' && covers[center]) onOpen(covers[center].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hovered, covers, center, last, onOpen])

  // The wheel over the carousel moves it, one cover per flick, and never scrolls the page under it.
  // (A native listener: React's wheel events are passive, so they can't stop the page scrolling.)
  const root = useRef<HTMLDivElement>(null)
  const lastWheel = useRef(0)
  useEffect(() => {
    const el = root.current
    if (!el || covers.length === 0) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (Math.abs(delta) < 8 || Date.now() - lastWheel.current < 220) return
      lastWheel.current = Date.now()
      setCenter((c) => (delta > 0 ? Math.min(last, c + 1) : Math.max(0, c - 1)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [covers.length, last])

  const active = covers[Math.min(center, last)]
  const navButton =
    'absolute top-1/2 z-50 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/10 backdrop-blur-md transition-all hover:bg-black/65 disabled:opacity-0'

  return (
    <div
      ref={root}
      className="flex w-full min-w-0 flex-col items-center gap-2 select-none"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div className="theme-display flex w-full items-center justify-center gap-1.5 px-1 text-small-strong text-secondary">{label}</div>
      {!active ? (
        <div className="flex h-[168px] w-full items-center justify-center">{empty}</div>
      ) : (
        <>
          {/* Clipped, so side covers stay inside the panel. */}
          <div className="relative h-[124px] w-full overflow-hidden [perspective:1200px]">
            <div className="absolute inset-0 flex items-center justify-center [transform-style:preserve-3d]">
              {covers.map((cover, i) => {
                const offset = i - center
                const abs = Math.abs(offset)
                if (abs > 3) return null
                const isCenter = offset === 0
                return (
                  <button
                    key={cover.id}
                    type="button"
                    onClick={() => (isCenter ? onOpen(cover.id) : setCenter(i))}
                    aria-label={isCenter ? `Play ${cover.title}` : `Show ${cover.title}`}
                    className="absolute aspect-video w-[200px] overflow-hidden rounded-xl bg-control-subtle shadow-xl ring-1 ring-white/10 transition-[transform,opacity] duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    style={{
                      transform: `translateX(${offset * 100}px) rotateY(${isCenter ? 0 : offset > 0 ? -48 : 48}deg) scale(${isCenter ? 1 : 0.82})`,
                      zIndex: 100 - abs,
                      opacity: abs > 2 ? 0.25 : 1
                    }}
                  >
                    <Thumbnail src={cover.thumbnail} />
                    {cover.overlay}
                    {isCenter && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/15 opacity-0 transition-opacity hover:opacity-100">
                        <span className="flex size-11 items-center justify-center rounded-full bg-black/60 backdrop-blur-md">
                          <PlayIcon className="ml-0.5 size-5 fill-white text-white" />
                        </span>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setCenter((c) => Math.max(0, c - 1))}
              disabled={center === 0}
              aria-label="Previous"
              className={`${navButton} left-1`}
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => setCenter((c) => Math.min(last, c + 1))}
              disabled={center >= last}
              aria-label="Next"
              className={`${navButton} right-1`}
            >
              <ChevronRightIcon className="size-5" />
            </button>
          </div>
          <div className="flex w-full min-w-0 flex-col items-center gap-0.5 px-2 text-center">
            <div className="flex max-w-full min-w-0 items-center gap-1.5">
              {active.platform && <PlatformDot platform={active.platform} />}
              <span className="truncate text-strong text-primary">{active.title}</span>
            </div>
            <span className="max-w-full truncate text-small text-tertiary">
              {active.subtitle} · {Math.min(center, last) + 1} / {covers.length}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
