import { useEffect, useRef } from 'react'
import Hls from 'hls.js'

/** Native <video> for direct HLS streams (Kick VODs and clips), with resume and progress reporting. */
export function HlsVideo({
  src,
  startAt = 0,
  onProgress,
  onEnded,
  controls = true,
  className = ''
}: {
  src: string
  startAt?: number
  onProgress?(t: number, d: number): void
  onEnded?(): void
  /** The browser's own controls (the PiP window draws its own). */
  controls?: boolean
  className?: string
}): React.JSX.Element {
  const ref = useRef<HTMLVideoElement>(null)
  const progressRef = useRef(onProgress)
  progressRef.current = onProgress
  const endedRef = useRef(onEnded)
  endedRef.current = onEnded

  useEffect(() => {
    const video = ref.current
    if (!video) return
    let hls: Hls | null = null
    const seek = (): void => {
      if (startAt > 0) video.currentTime = startAt
      video.play().catch(() => {})
    }
    // hls.js first: Chromium's newer built-in HLS support can't play Kick clips (it rejects their
    // byte-range playlists when the UI is served over http, as in dev). Native is the fallback.
    if (Hls.isSupported()) {
      hls = new Hls({ startPosition: startAt > 0 ? startAt : -1 })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.addEventListener('loadedmetadata', seek, { once: true })
    }
    const report = (): void => {
      if (video.duration && Number.isFinite(video.duration)) progressRef.current?.(video.currentTime, video.duration)
    }
    const timer = setInterval(report, 5000)
    const ended = (): void => endedRef.current?.()
    video.addEventListener('pause', report)
    video.addEventListener('ended', ended)
    return () => {
      video.removeEventListener('ended', ended)
      report()
      clearInterval(timer)
      video.removeEventListener('pause', report)
      hls?.destroy()
    }
  }, [src, startAt])

  return <video ref={ref} controls={controls} autoPlay data-hls-src={src} playsInline className={`h-full w-full bg-black ${className}`} />
}
