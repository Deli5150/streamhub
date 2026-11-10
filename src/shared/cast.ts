import type { Platform } from './types'
import type { Variant } from './twitchAdFilter'

// Casting (Android → Chromecast / Google TV). The TV plays the stream itself through Google's Default
// Media Receiver, so it needs the stream's own HLS or MP4 link rather than a player page. These are
// the parts that don't touch the network: which video a player URL is, and which link to hand over.

export type CastTarget =
  | { platform: 'twitch'; kind: 'live'; login: string }
  | { platform: 'twitch'; kind: 'vod'; id: string }
  | { platform: 'twitch'; kind: 'clip'; slug: string }
  | { platform: 'kick'; kind: 'live'; slug: string }
  | { platform: 'rumble'; id: string }
  | { platform: 'youtube'; videoId: string }
  /** Already a stream link (Kick's past streams and clips play from their HLS link). */
  | { platform: Platform; kind: 'direct'; url: string }

/** What a player plays, from the URL it was given (see shared/urls.ts and the providers). */
export function castTarget(platform: Platform, url: string, hls = false): CastTarget | null {
  if (hls) return { platform, kind: 'direct', url }
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const q = u.searchParams
  switch (platform) {
    case 'twitch':
      if (u.hostname === 'clips.twitch.tv' && q.get('clip')) return { platform, kind: 'clip', slug: q.get('clip')! }
      if (q.get('video')) return { platform, kind: 'vod', id: q.get('video')!.replace(/^v/, '') }
      if (q.get('channel')) return { platform, kind: 'live', login: q.get('channel')!.toLowerCase() }
      return null
    case 'kick': {
      const slug = u.hostname === 'player.kick.com' ? u.pathname.split('/').filter(Boolean)[0] : undefined
      return slug ? { platform, kind: 'live', slug } : null
    }
    case 'rumble': {
      const id = u.pathname.match(/^\/embed\/(v[a-z0-9]+)/i)?.[1]
      return id ? { platform, id } : null
    }
    case 'youtube': {
      const id = u.pathname.match(/^\/embed\/([\w-]{11})/)?.[1] ?? q.get('v')
      return id ? { platform, videoId: id } : null
    }
  }
}

/** The quality to send to a TV: the best one up to 1080p (the source quality when it fits). */
export function castVariant(variants: Variant[]): Variant | undefined {
  const height = (v: Variant): number => Number(v.resolution.split('x')[1]) || 0
  const video = variants.filter((v) => height(v) > 0)
  const fits = video.filter((v) => height(v) <= 1080)
  const pool = fits.length ? fits : video
  return [...pool].sort((a, b) => height(b) - height(a) || b.frameRate - a.frameRate || b.bandwidth - a.bandwidth)[0]
}

interface RumbleSource {
  url?: string
  meta?: { h?: number; w?: number }
}
/** Rumble's embed data (embedJS/u3/?request=video): the parts used for casting. */
export interface RumbleVideo {
  title?: string
  i?: string
  live?: number
  u?: { hls?: RumbleSource; mp4?: RumbleSource }
  ua?: { hls?: Record<string, RumbleSource>; mp4?: Record<string, RumbleSource> }
}

/**
 * Rumble's link for a TV. A recorded video plays as MP4 (a TV plays a plain file without the CORS
 * permission that HLS needs); a live stream only has HLS.
 */
export function rumbleCastSource(v: RumbleVideo): { url: string; hls: boolean; live: boolean } | null {
  const live = Boolean(v.live)
  const hls = v.ua?.hls?.auto?.url ?? Object.values(v.ua?.hls ?? {})[0]?.url ?? v.u?.hls?.url
  const mp4s = Object.entries(v.ua?.mp4 ?? {})
    .map(([q, s]) => ({ url: s.url, height: s.meta?.h ?? (Number(q) || 0) }))
    .filter((s): s is { url: string; height: number } => Boolean(s.url) && s.height <= 1080)
    .sort((a, b) => b.height - a.height)
  const mp4 = mp4s[0]?.url ?? v.u?.mp4?.url
  if (!live && mp4) return { url: mp4, hls: false, live }
  if (hls) return { url: hls, hls: true, live }
  return mp4 ? { url: mp4, hls: false, live } : null
}
