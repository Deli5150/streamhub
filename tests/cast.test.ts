import { describe, expect, it } from 'vitest'
import { castTarget, castVariant, rumbleCastSource } from '../src/shared/cast'

describe('castTarget', () => {
  it('reads Twitch live, past broadcasts and clips', () => {
    expect(castTarget('twitch', 'https://player.twitch.tv/?channel=Foo&parent=twitch.tv')).toEqual({ platform: 'twitch', kind: 'live', login: 'foo' })
    expect(castTarget('twitch', 'https://player.twitch.tv/?video=v123&parent=twitch.tv')).toEqual({ platform: 'twitch', kind: 'vod', id: '123' })
    expect(castTarget('twitch', 'https://clips.twitch.tv/embed?clip=Slug-abc&parent=twitch.tv')).toEqual({ platform: 'twitch', kind: 'clip', slug: 'Slug-abc' })
  })

  it('reads Kick, Rumble and YouTube players', () => {
    expect(castTarget('kick', 'https://player.kick.com/xqc?autoplay=true')).toEqual({ platform: 'kick', kind: 'live', slug: 'xqc' })
    expect(castTarget('rumble', 'https://rumble.com/embed/v6zkg0r/?autoplay=2')).toEqual({ platform: 'rumble', id: 'v6zkg0r' })
    expect(castTarget('youtube', 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1')).toEqual({ platform: 'youtube', videoId: 'dQw4w9WgXcQ' })
  })

  it('passes stream links through', () => {
    expect(castTarget('kick', 'https://x.test/a.m3u8', true)).toEqual({ platform: 'kick', kind: 'direct', url: 'https://x.test/a.m3u8' })
    expect(castTarget('twitch', 'not a url')).toBeNull()
  })
})

describe('castVariant', () => {
  const v = (resolution: string, frameRate = 30, bandwidth = 1): { url: string; resolution: string; frameRate: number; bandwidth: number } => ({
    url: resolution,
    resolution,
    frameRate,
    bandwidth
  })
  it('picks the best quality up to 1080p', () => {
    expect(castVariant([v('1280x720', 60), v('2560x1440'), v('1920x1080', 60), v('')])?.url).toBe('1920x1080')
    expect(castVariant([v('1280x720', 30), v('1280x720', 60)])?.frameRate).toBe(60)
    expect(castVariant([v('2560x1440')])?.url).toBe('2560x1440')
  })
})

describe('rumbleCastSource', () => {
  it('prefers MP4 for recorded videos and HLS for live', () => {
    const ua = { mp4: { '360': { url: 'a360.mp4' }, '1080': { url: 'a1080.mp4' }, '2160': { url: 'a4k.mp4' } }, hls: { auto: { url: 'auto.m3u8' } } }
    expect(rumbleCastSource({ ua })).toEqual({ url: 'a1080.mp4', hls: false, live: false })
    expect(rumbleCastSource({ ua, live: 2 })).toEqual({ url: 'auto.m3u8', hls: true, live: true })
    expect(rumbleCastSource({ u: { hls: { url: 'u.m3u8' } }, live: 2 })).toEqual({ url: 'u.m3u8', hls: true, live: true })
    expect(rumbleCastSource({})).toBeNull()
  })
})
