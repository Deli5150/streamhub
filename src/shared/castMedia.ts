import { castTarget, castVariant, rumbleCastSource, type CastTarget, type RumbleVideo } from './cast'
import { accessTokenBody, parseMaster } from './twitchAdFilter'
import type { Platform } from './types'

// Casting, the part that finds the link a TV plays (Google's Default Media Receiver plays HLS or MP4
// itself): shared by Android (mobile/src/lib/cast.ts) and the desktop (src/main/cast.ts). Each passes
// its own getJson, which reads Kick's and Rumble's APIs through that platform's signed-in session.

export type GetJson = <T>(p: Platform, url: string) => Promise<T>

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
export async function resolveCastMedia(t: CastTarget, getJson: GetJson): Promise<CastMedia> {
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

