import type { Channel, LiveInfo, Platform } from './types'

/** Player page for a live channel, loaded top-level in a <webview>. */
export function embedUrl(ch: Channel, live?: LiveInfo): string | null {
  switch (ch.platform) {
    case 'twitch':
      // Same URL Twitch's own "Popout Player" uses, so the parent check passes.
      return `https://player.twitch.tv/?channel=${ch.id}&parent=twitch.tv&player=popout&autoplay=true`
    case 'youtube':
      return live?.streamId ? `https://www.youtube.com/embed/${live.streamId}?autoplay=1` : null
    case 'kick':
      return `https://player.kick.com/${ch.id}?autoplay=true`
    case 'rumble':
      return live?.streamId ? `https://rumble.com/embed/${live.streamId}/?autoplay=2` : null
  }
}

export function chatUrl(ch: Channel, live?: LiveInfo): string | null {
  switch (ch.platform) {
    case 'twitch':
      return `https://www.twitch.tv/popout/${ch.id}/chat?darkpopout`
    case 'youtube':
      return live?.streamId ? `https://www.youtube.com/live_chat?v=${live.streamId}&dark_theme=1` : null
    case 'kick':
      return `https://kick.com/popout/${ch.id}/chat`
    case 'rumble':
      return live?.chatId ? `https://rumble.com/chat/popup/${live.chatId}` : null
  }
}

export function channelPageUrl(ch: Channel): string {
  switch (ch.platform) {
    case 'twitch':
      return `https://www.twitch.tv/${ch.id}`
    case 'youtube':
      return `https://www.youtube.com/channel/${ch.id}`
    case 'kick':
      return `https://kick.com/${ch.id}`
    case 'rumble':
      return `https://rumble.com/${ch.id}`
  }
}

/** Rumble embed ids are the numeric video id in base 36, prefixed with "v". */
export const rumbleEmbedId = (numericId: string): string => 'v' + Number(numericId).toString(36)

export function parseCount(text: string | undefined): number | undefined {
  if (!text) return undefined
  const m = text.trim().replace(/,/g, '').match(/^([\d.]+)\s*([KkMm])?/)
  if (!m) return undefined
  const n = parseFloat(m[1])
  const mult = m[2]?.toLowerCase() === 'k' ? 1e3 : m[2]?.toLowerCase() === 'm' ? 1e6 : 1
  return Math.round(n * mult)
}

/** Session the Twitch video player runs in while ad blocking is on (see main/twitchAds.ts). */
export const TWITCH_PLAYER_PARTITION = 'persist:twitch-player'

/**
 * Partition for a player/page URL: Twitch's video player uses the ad-filtered player session when ad
 * blocking is on; everything else (chat, clips, other platforms) uses the platform's signed-in one.
 */
export function partitionFor(platform: Platform, url: string, blockTwitchAds: boolean): string {
  if (platform === 'twitch' && blockTwitchAds && url.startsWith('https://player.twitch.tv/')) return TWITCH_PLAYER_PARTITION
  return `persist:${platform}`
}
