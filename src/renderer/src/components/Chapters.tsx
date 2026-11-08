import { useEffect, useState } from 'react'
import { ListOrderedIcon, XIcon } from 'lucide-react'
import type { Platform, VideoChapter } from '@shared/types'

/** 75 → "1:15", 3723 → "1:02:03". */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`
}

/** A video's chapters (YouTube; others have none). Empty until loaded, and when there are none. */
export function useChapters(platform: Platform, mediaId: string | undefined): VideoChapter[] {
  const [chapters, setChapters] = useState<{ id: string; list: VideoChapter[] } | null>(null)
  useEffect(() => {
    if (platform !== 'youtube' || !mediaId) return
    let alive = true
    window.api
      .getChapters(platform, mediaId)
      .then((list) => alive && setChapters({ id: mediaId, list }))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [platform, mediaId])
  return chapters && chapters.id === mediaId ? chapters.list : []
}

/**
 * Round overlay button (like the player's PiP button) that opens the video's chapter list to the left
 * of it; picking one jumps there. Renders nothing for videos without chapters.
 */
export function ChaptersButton({
  chapters,
  currentTime,
  onSeek,
  buttonClass
}: {
  chapters: VideoChapter[]
  /** Where the video is now, to mark the current chapter when the list opens. */
  currentTime(): number
  onSeek(seconds: number): void
  buttonClass: string
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(0)
  if (!chapters.length) return null
  const current = chapters.reduce((at, c, i) => (c.start <= now ? i : at), 0)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setNow(currentTime())
          setOpen((v) => !v)
        }}
        title="Chapters"
        aria-expanded={open}
        className={buttonClass}
      >
        <ListOrderedIcon className="size-4 text-white" strokeWidth={2.25} />
      </button>
      {open && (
        <div className="absolute top-1/2 right-11 z-30 flex max-h-[min(420px,70vh)] w-[300px] -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-black/80 shadow-2xl ring-1 ring-white/15 backdrop-blur-xl">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 pr-1.5 pl-3">
            <span className="text-small-strong text-white">
              Chapters <span className="text-white/50 tabular-nums">({chapters.length})</span>
            </span>
            <button type="button" onClick={() => setOpen(false)} title="Close" className="flex size-7 items-center justify-center rounded-full hover:bg-white/15">
              <XIcon className="size-3.5 text-white/80" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {chapters.map((c, i) => (
              <button
                key={c.start}
                type="button"
                onClick={() => {
                  onSeek(c.start)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2.5 px-2 py-1.5 text-left transition-colors ${i === current ? 'bg-white/15' : 'hover:bg-white/10'}`}
              >
                {c.thumbnail ? (
                  <img src={c.thumbnail} alt="" loading="lazy" className="aspect-video w-[72px] shrink-0 rounded object-cover ring-1 ring-white/10" />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-small-strong leading-snug text-white">{c.title}</span>
                  <span className="text-small text-accent tabular-nums">{clockText(c.start)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
