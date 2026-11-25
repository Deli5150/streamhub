import { useEffect, useRef, useState } from 'react'
import { Platform as OS } from 'react-native'
import type * as GoogleCastModule from 'react-native-google-cast'
import { castTarget, type CastTarget } from '@shared/cast'
import { resolveCastMedia as resolveShared, YouTubeCastError, type CastMedia } from '@shared/castMedia'
import type { Platform } from '@shared/types'
import { getJson } from '../desktop/net'

// Casting on Android: Chromecast and Google TV, through Google's Cast framework. The cast button
// (ui/CastButton) opens the device picker; once a TV is connected, whichever player is on screen
// sends its stream there (useCastPlayback) and shows "Playing on <TV>" instead of playing itself.
// iPhone casts with AirPlay and never loads any of this.

/** react-native-google-cast, on Android only (it isn't linked into the iPhone app). */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on Android only
export const GoogleCast: typeof GoogleCastModule | null = OS.OS === 'android' ? (require('react-native-google-cast') as typeof GoogleCastModule) : null

export { YouTubeCastError, type CastMedia }

/** The stream link a TV can play for this video. */
export const resolveCastMedia = (t: CastTarget): Promise<CastMedia> => resolveShared(t, getJson)

export interface CastInfo {
  title?: string
  subtitle?: string
  thumbnail?: string
}

export interface CastPlayback {
  /** The TV it's playing on. */
  device: string
  state: 'loading' | 'playing' | 'error'
  error?: string
  /** Set when the video is from YouTube (only the YouTube app can cast it). */
  youtubeId?: string
}

/**
 * While a TV is connected, sends this player's video to it (once per video) and reports how that
 * went; null when nothing is connected, so the player plays on the phone as usual.
 */
export function useCastPlayback(platform: Platform, url: string, hls: boolean, resumeAt: number, info: CastInfo = {}): CastPlayback | null {
  const session = GoogleCast?.useCastSession() ?? null
  const device = GoogleCast?.useCastDevice() ?? null
  const client = session?.client ?? null
  const [state, setState] = useState<Omit<CastPlayback, 'device'> & { for: string }>({ for: '', state: 'loading' })
  // The latest title and start position, read when the video is sent (they don't resend it).
  const infoRef = useRef(info)
  const startAt = useRef(resumeAt)
  useEffect(() => {
    infoRef.current = info
    startAt.current = resumeAt
  })

  useEffect(() => {
    if (!client) return
    let cancelled = false
    const target = castTarget(platform, url, hls)
    ;(async () => {
      if (!target) throw new Error('This video can’t be cast')
      const media = await resolveCastMedia(target)
      if (cancelled) return
      const { title, subtitle, thumbnail } = infoRef.current
      await client.loadMedia({
        autoplay: true,
        startTime: media.live ? undefined : startAt.current || undefined,
        mediaInfo: {
          contentUrl: media.url,
          contentType: media.contentType,
          streamType: media.live ? GoogleCast!.MediaStreamType.LIVE : GoogleCast!.MediaStreamType.BUFFERED,
          metadata: { type: 'movie', title: title ?? 'StreamHub', subtitle, images: thumbnail ? [{ url: thumbnail }] : undefined }
        }
      })
      if (!cancelled) setState({ for: url, state: 'playing' })
    })().catch((e: unknown) => {
      if (cancelled) return
      console.log('[cast]', (e as Error).message)
      setState({ for: url, state: 'error', error: (e as Error).message, youtubeId: e instanceof YouTubeCastError ? e.videoId : undefined })
    })
    return () => {
      cancelled = true
    }
  }, [client, platform, url, hls])

  if (!client || !device) return null
  return { device: device.friendlyName, ...(state.for === url ? state : { state: 'loading' }) }
}
