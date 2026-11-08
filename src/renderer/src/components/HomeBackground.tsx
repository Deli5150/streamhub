import { useEffect, useState } from 'react'
import { useBackground, useWallpaperIsLight } from '../lib/background'

const DWELL_MS = 8000
const FADE_MS = 1200

/** Wallpaper(s) behind the home screen, crossfading when several are enabled, with a legibility scrim. */
export function HomeBackground(): React.JSX.Element | null {
  const { images, multiEnabled, fit, zoom, rotation, load } = useBackground()
  const isLight = useWallpaperIsLight()
  const cycling = multiEnabled && images.length > 1
  const [index, setIndex] = useState(0)

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!cycling || index >= images.length) setIndex(0)
  }, [cycling, images.length, index])

  useEffect(() => {
    if (!cycling) return
    const id = setInterval(() => setIndex((i) => (i + 1) % images.length), DWELL_MS)
    return () => clearInterval(id)
  }, [cycling, images.length])

  if (images.length === 0) return null
  const shown = multiEnabled ? images : images.slice(0, 1)

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      {shown.map((src, i) => (
        <img
          key={src.slice(0, 64) + i}
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full transition-opacity ease-in-out"
          style={{
            objectFit: fit,
            transform: `rotate(${rotation}deg) scale(${zoom})`,
            opacity: i === index ? 1 : 0,
            transitionDuration: `${FADE_MS}ms`
          }}
        />
      ))}
      <div className={`absolute inset-0 ${isLight === null ? 'bg-background/45' : isLight ? 'bg-white/30' : 'bg-black/40'}`} />
    </div>
  )
}
