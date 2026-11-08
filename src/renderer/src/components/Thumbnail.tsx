import { useEffect, useState } from 'react'
import { RadioIcon } from 'lucide-react'

/** Stream/VOD preview image; a placeholder glyph only if the platform provided none or it failed to load. */
export function Thumbnail({ src, className = '' }: { src?: string; className?: string }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
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
      onError={() => setFailed(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  )
}
