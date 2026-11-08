import { describe, expect, it } from 'vitest'
import { accessTokenBody, hasSegments, parseMaster, pickVariant, stitchPlaylist, stripTwitchAds } from '../src/main/twitchAds'
import { partitionFor } from '../src/shared/urls'

const live = (n: number): string => `#EXT-X-PROGRAM-DATE-TIME:2026-10-28T10:00:0${n}.000Z\n#EXTINF:2.000,live\nhttps://video-edge.example/live${n}.ts`
const ad = (n: number): string => `#EXT-X-PROGRAM-DATE-TIME:2026-10-28T10:00:1${n}.000Z\n#EXTINF:2.000,Amazon|123\nhttps://video-edge.example/ad${n}.ts`
const head = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:100'

describe('stripTwitchAds', () => {
  it('leaves playlists without an ad break untouched', () => {
    const p = [head, live(1), live(2), '#EXT-X-TWITCH-PREFETCH:https://video-edge.example/live3.ts'].join('\n')
    expect(stripTwitchAds(p)).toEqual({ text: p, removed: 0 })
  })

  it('drops stitched ad segments, their timestamps, ad metadata and prefetch hints', () => {
    const p = [
      head,
      live(1),
      '#EXT-X-DATERANGE:ID="stitched-ad-1",CLASS="twitch-stitched-ad",START-DATE="2026-10-28T10:00:10Z",DURATION=4',
      ad(1),
      ad(2),
      live(3),
      '#EXT-X-TWITCH-PREFETCH:https://video-edge.example/ad3.ts'
    ].join('\n')
    const { text, removed } = stripTwitchAds(p)
    expect(removed).toBe(2)
    expect(text).not.toMatch(/ad\d\.ts|Amazon|stitched|PREFETCH|10:00:1/)
    expect(text).toContain('live1.ts')
    expect(text).toContain('live3.ts')
    expect(text.startsWith(head)).toBe(true)
  })

  it('leaves nothing to play when a pre-roll is cut, which is why the filter keeps those', () => {
    const preroll = [head, '#EXT-X-DATERANGE:ID="stitched-ad-1",CLASS="twitch-stitched-ad",START-DATE="2026-10-28T10:00:10Z",DURATION=6', ad(1), ad(2), ad(3)].join('\n')
    expect(hasSegments(preroll)).toBe(true)
    expect(hasSegments(stripTwitchAds(preroll).text)).toBe(false)
    expect(hasSegments(stripTwitchAds([head, ad(1), live(2)].join('\n')).text)).toBe(true)
  })
})

describe('partitionFor', () => {
  it('sends only the Twitch video player to the filtered session', () => {
    expect(partitionFor('twitch', 'https://player.twitch.tv/?channel=x', true)).toBe('persist:twitch-player')
    expect(partitionFor('twitch', 'https://player.twitch.tv/?channel=x', false)).toBe('persist:twitch')
    expect(partitionFor('twitch', 'https://www.twitch.tv/popout/x/chat', true)).toBe('persist:twitch')
    expect(partitionFor('kick', 'https://player.kick.com/x', true)).toBe('persist:kick')
  })
})

const master = [
  '#EXTM3U',
  '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="chunked",NAME="1080p60 (source)",AUTOSELECT=YES,DEFAULT=YES',
  '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,CODECS="avc1.64002A,mp4a.40.2",VIDEO="chunked",FRAME-RATE=60.000',
  'https://use15.playlist.ttvnw.net/v1/playlist/source.m3u8',
  '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="720p60",NAME="720p60",AUTOSELECT=YES,DEFAULT=YES',
  '#EXT-X-STREAM-INF:BANDWIDTH=3400000,RESOLUTION=1280x720,CODECS="avc1.4D401F,mp4a.40.2",VIDEO="720p60",FRAME-RATE=60.000',
  'https://use15.playlist.ttvnw.net/v1/playlist/720.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=630000,RESOLUTION=640x360,CODECS="avc1.4D401E,mp4a.40.2",VIDEO="360p30",FRAME-RATE=30.000',
  'https://use15.playlist.ttvnw.net/v1/playlist/360.m3u8'
].join('\n')

describe('backup stream helpers', () => {
  it('reads variants from a master playlist', () => {
    const v = parseMaster(master)
    expect(v.map((x) => [x.resolution, x.frameRate])).toEqual([
      ['1920x1080', 60],
      ['1280x720', 60],
      ['640x360', 30]
    ])
    expect(v[1].url).toMatch(/720\.m3u8$/)
  })

  it('picks the same quality, else the nearest', () => {
    const v = parseMaster(master)
    expect(pickVariant(v, { resolution: '1280x720', frameRate: 60 })?.url).toMatch(/720/)
    expect(pickVariant(v, { resolution: '852x480', frameRate: 30 })?.url).toMatch(/360/)
    expect(pickVariant(v.slice(1), { resolution: '1920x1080', frameRate: 60 })?.url).toMatch(/720/)
  })

  it('builds a live access-token request for any player type and platform', () => {
    const body = JSON.parse(accessTokenBody('somechannel', { playerType: 'autoplay', platform: 'android' }))
    expect(body.variables).toEqual({ login: 'somechannel', playerType: 'autoplay', platform: 'android' })
    expect(body.query).toContain('streamPlaybackAccessToken(channelName: $login')
    expect(body.query).toContain('platform: $platform')
  })
})

describe('stitchPlaylist', () => {
  // A segment of copy `c` covering second `t` of the stream.
  const seg = (c: string, t: number): string => `#EXT-X-PROGRAM-DATE-TIME:2026-10-29T10:00:${String(t).padStart(2, '0')}.000Z\n#EXTINF:2.000,live\nhttps://${c}.example/s${t}.ts`
  const pl = (seq: number, c: string, times: number[]): string => ['#EXTM3U', '#EXT-X-TARGETDURATION:2', `#EXT-X-MEDIA-SEQUENCE:${seq}`, ...times.map((t) => seg(c, t))].join('\n')
  const seqOf = (text: string): number => Number(text.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1])
  const uris = (text: string): string[] => text.split('\n').filter((l) => l.startsWith('https://'))

  it('passes a single source through with its own numbering', () => {
    const a = stitchPlaylist(undefined, 'twitch', pl(500, 'main', [0, 2, 4]))!
    expect(seqOf(a.text)).toBe(500)
    const b = stitchPlaylist(a.state, 'twitch', pl(501, 'main', [2, 4, 6]))!
    expect(seqOf(b.text)).toBe(501)
    expect(b.text).not.toContain('DISCONTINUITY')
    expect(uris(b.text)).toEqual(['https://main.example/s2.ts', 'https://main.example/s4.ts', 'https://main.example/s6.ts'])
  })

  it('keeps numbering moving forward across a switch to a copy numbered lower, without repeating time', () => {
    const a = stitchPlaylist(undefined, 'autoplay/android', pl(9000, 'android', [0, 2, 4]))!
    // The embed copy numbers its segments far lower, and still holds seconds 2 and 4.
    const b = stitchPlaylist(a.state, 'embed/web', pl(120, 'embed', [2, 4, 6, 8]))!
    // Seconds 2 and 4 already came from the android copy, so only 6 and 8 are new, numbered right
    // after the android copy's 9000–9002.
    expect(uris(b.text)).toEqual(['https://embed.example/s6.ts', 'https://embed.example/s8.ts'])
    expect(seqOf(b.text)).toBe(9003)
    // The switch is marked, right before the first segment of the new copy.
    expect(b.text).toMatch(/#EXT-X-DISCONTINUITY\n#EXT-X-PROGRAM-DATE-TIME:2026-10-29T10:00:06\.000Z\n#EXTINF:2\.000,live\nhttps:\/\/embed\.example\/s6\.ts/)
    // Later reloads of the copy keep its numbers and the one marker.
    const c = stitchPlaylist(b.state, 'embed/web', pl(123, 'embed', [6, 8, 10]))!
    expect(seqOf(c.text)).toBe(9003)
    expect(uris(c.text)).toEqual(['https://embed.example/s6.ts', 'https://embed.example/s8.ts', 'https://embed.example/s10.ts'])
    expect(c.text.match(/DISCONTINUITY/g)).toHaveLength(1)
  })

  it('returns null when a copy has nothing newer than what the player already has', () => {
    const a = stitchPlaylist(undefined, 'embed/web', pl(10, 'embed', [10, 12]))!
    expect(stitchPlaylist(a.state, 'twitch', pl(400, 'main', [8, 10, 12]))).toBeNull()
  })
})
