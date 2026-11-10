import { useEffect, useRef, useState } from 'react'
import { Platform as OS } from 'react-native'
import type * as GoogleCastModule from 'react-native-google-cast'
import { castTarget, castVariant, rumbleCastSource, type CastTarget, type RumbleVideo } from '@shared/cast'
import { accessTokenBody, parseMaster } from '@shared/twitchAdFilter'
import type { Platform } from '@shared/types'
import { getJson } from '../desktop/net'

// Casting on Android: Chromecast and Google TV, through Google's Cast framework. The cast button
// (ui/CastButton) opens the device picker; once a TV is connected, whichever player is on screen
// sends its stream there (useCastPlayback) and shows "Playing on <TV>" instead of playing itself.
// iPhone casts with AirPlay and never loads any of this.

/** react-native-google-cast, on Android only (it isn't linked into the iPhone app). */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on Android only
export const GoogleCast: typeof GoogleCastModule | null = OS.OS === 'android' ? (require('react-native-google-cast') as typeof GoogleCastModule) : null

const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
const HLS = 'application/x-mpegurl'

export interface CastMedia {
  url: string
  contentType: string
  live: boolean
}

/** Thrown for YouTube: it only lets its own apps send its videos to a TV. */
export class YouTubeCastError extends Error {
  constructor(readonly videoId: string) {
    super('YouTube videos can only be cast from the YouTube app')
  }
}

async function twitchGql<T>(body: string): Promise<T> {
  const res = await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' }, body })
  if (!res.ok) throw new Error(`Twitch: HTTP ${res.status}`)
  return (await res.json()) as T
}

/**
 * A Twitch master playlist's best quality. The TV gets that quality's own playlist: Twitch's master
 * playlist doesn't allow other sites to read it (no CORS), the per-quality ones do.
 */
async function twitchVariant(master: string): Promise<CastMedia & { live: boolean }> {
  const res = await fetch(master)
  if (!res.ok) throw new Error(res.status === 403 ? 'Twitch won’t share this stream (subscriber-only or region-locked)' : `Twitch: HTTP ${res.status}`)
  const variant = castVariant(parseMaster(await res.text()))
  if (!variant) throw new Error('Twitch sent no video for this stream')
  return { url: variant.url, contentType: HLS, live: true }
}

const tokenQuery = (token: { value: string; signature: string }): string =>
  `client_id=${TWITCH_CLIENT_ID}&token=${encodeURIComponent(token.value)}&sig=${token.signature}&allow_source=true&player_backend=mediaplayer&p=${Math.floor(Math.random() * 1e6)}`

/** The stream link a TV can play for this video. */
export async function resolveCastMedia(t: CastTarget): Promise<CastMedia> {
  if ('kind' in t && t.kind === 'direct') return { url: t.url, contentType: /\.mp4(\?|$)/.test(t.url) ? 'video/mp4' : HLS, live: false }
  switch (t.platform) {
    case 'twitch': {
      if (t.kind === 'live') {
        const r = await twitchGql<{ data?: { streamPlaybackAccessToken?: { value: string; signature: string } } }>(
          accessTokenBody(t.login, { playerType: 'embed', platform: 'web' })
        )
        const token = r.data?.streamPlaybackAccessToken
        if (!token) throw new Error('Twitch didn’t allow this stream to play')
        return twitchVariant(`https://usher.ttvnw.net/api/channel/hls/${t.login}.m3u8?${tokenQuery(token)}`)
      }
      if (t.kind === 'vod') {
        const query = `{ videoPlaybackAccessToken(id: ${JSON.stringify(t.id)}, params: {platform: "web", playerBackend: "mediaplayer", playerType: "embed"}) { value signature } }`
        const r = await twitchGql<{ data?: { videoPlaybackAccessToken?: { value: string; signature: string } } }>(JSON.stringify({ query }))
        const token = r.data?.videoPlaybackAccessToken
        if (!token) throw new Error('Twitch didn’t allow this video to play')
        return { ...(await twitchVariant(`https://usher.ttvnw.net/vod/${t.id}.m3u8?${tokenQuery(token)}`)), live: false }
      }
      if (t.kind === 'clip') {
        const query = `{ clip(slug: ${JSON.stringify(t.slug)}) { playbackAccessToken(params: {platform: "web", playerBackend: "mediaplayer", playerType: "embed"}) { value signature } videoQualities { quality sourceURL } } }`
        const r = await twitchGql<{
          data?: { clip?: { playbackAccessToken?: { value: string; signature: string }; videoQualities?: { quality: string; sourceURL: string }[] } }
        }>(JSON.stringify({ query }))
        const clip = r.data?.clip
        const best = [...(clip?.videoQualities ?? [])].filter((q) => Number(q.quality) <= 1080).sort((a, b) => Number(b.quality) - Number(a.quality))[0]
        if (!clip?.playbackAccessToken || !best) throw new Error('Twitch didn’t allow this clip to play')
        const sep = best.sourceURL.includes('?') ? '&' : '?'
        return {
          url: `${best.sourceURL}${sep}sig=${clip.playbackAccessToken.signature}&token=${encodeURIComponent(clip.playbackAccessToken.value)}`,
          contentType: 'video/mp4',
          live: false
        }
      }
      break
    }
    case 'kick': {
      const ch = await getJson<{ playback_url?: string }>('kick', `https://kick.com/api/v2/channels/${encodeURIComponent(t.slug)}`)
      if (!ch.playback_url) throw new Error('Kick sent no stream for this channel')
      return { url: ch.playback_url, contentType: HLS, live: true }
    }
    case 'rumble': {
      const v = await getJson<RumbleVideo>('rumble', `https://rumble.com/embedJS/u3/?request=video&ver=2&v=${t.id}`)
      const src = rumbleCastSource(v)
      if (!src) throw new Error('Rumble sent no stream for this video')
      return { url: src.url, contentType: src.hls ? HLS : 'video/mp4', live: src.live }
    }
    case 'youtube':
      throw new YouTubeCastError(t.videoId)
  }
  throw new Error('This video can’t be cast')
}

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
