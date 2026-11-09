import { useEffect, useState } from 'react'
import { RadioIcon } from 'lucide-react'

/** Stream/VOD preview image; a placeholder glyph only if the platform provided none or it failed to load. */
export function Thumbnail({ src, className = '' }: { src?: string; className?: string }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  // Fades in once, the first time it loads (not again when a live preview refreshes its URL).
  const [loaded, setLoaded] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (!src || failed) {
    return (
      <div className={`flex h-full w-full items-center justify-center text-quaternary ${className}`}>
        <RadioIcon className="size-8" strokeWidth={1.5} />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={`h-full w-full object-cover transition-[opacity,transform] duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
    />
  )
}
