import { memo, useEffect, useState } from 'react'

const MAX_RETRIES = 2

/**
 * Avatar image that survives transient CDN failures: a failed load retries (cache-busted) a couple
 * of times before falling back to the channel's initial.
 */
function ChannelAvatarImpl({
  src,
  name,
  className = '',
  fallbackTextClassName = 'text-regular text-secondary font-medium'
}: {
  src?: string
  name: string
  className?: string
  fallbackTextClassName?: string
}): React.JSX.Element {
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setAttempt(0)
    setFailed(false)
  }, [src])

  if (src && !failed) {
    const url = attempt > 0 ? `${src}${src.includes('?') ? '&' : '?'}_r=${attempt}` : src
    return (
      <img
        key={url}
        src={url}
        alt={name}
        draggable={false}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        className={className}
        onError={() => (attempt < MAX_RETRIES ? setAttempt(attempt + 1) : setFailed(true))}
      />
    )
  }
  return (
    <div className={`${className} flex items-center justify-center`}>
      <span className={fallbackTextClassName}>{name.charAt(0).toUpperCase()}</span>
    </div>
  )
}

export const ChannelAvatar = memo(ChannelAvatarImpl)
