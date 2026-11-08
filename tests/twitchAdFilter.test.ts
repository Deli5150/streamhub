import { describe, expect, it } from 'vitest'
import { createTwitchAdFilter, type FilterFetch } from '../src/shared/twitchAdFilter'

// The whole filter against a fake Twitch: token requests, a master playlist, and media playlists
// with and without stitched ad breaks.

const USHER = 'https://usher.ttvnw.net/api/channel/hls/somechannel.m3u8?sig=a&token=b'
const PLAYER_720 = 'https://use15.playlist.ttvnw.net/v1/playlist/player-720.m3u8'
const BACKUP_720 = 'https://use15.playlist.ttvnw.net/v1/playlist/backup-720.m3u8'

const masterWith = (url720: string): string =>
  ['#EXTM3U', '#EXT-X-STREAM-INF:BANDWIDTH=3400000,RESOLUTION=1280x720,FRAME-RATE=60.000', url720].join('\n')

const head = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:10'
const seg = (copy: string, t: number, title = 'live'): string =>
  `#EXT-X-PROGRAM-DATE-TIME:2026-11-02T10:00:${String(t).padStart(2, '0')}.000Z\n#EXTINF:2.000,${title}\nhttps://video-edge.example/${copy}${t}.ts`
const adBreak = '#EXT-X-DATERANGE:ID="stitched-ad-1",CLASS="twitch-stitched-ad",DURATION=30'

/** Fake network: one backup token kind works (or none), and its 720p copy has the given playlist. */
function fakeTwitch(backupPlaylist: string | null): { fetch: FilterFetch; tokenBodies: string[] } {
  const tokenBodies: string[] = []
  const fetch: FilterFetch = async (input, init) => {
    if (input.startsWith('https://gql.twitch.tv/gql')) {
      tokenBodies.push(String(init?.body))
      const ok = backupPlaylist !== null && JSON.parse(String(init?.body)).variables.playerType === 'embed'
      return new Response(JSON.stringify({ data: { streamPlaybackAccessToken: ok ? { value: 'tok', signature: 'sig' } : null } }))
    }
    if (input.startsWith('https://usher.ttvnw.net/')) return new Response(masterWith(BACKUP_720))
    if (input === BACKUP_720 && backupPlaylist) return new Response(backupPlaylist)
    return new Response('', { status: 404 })
  }
  return { fetch, tokenBodies }
}

async function started(backupPlaylist: string | null): Promise<{ filter: ReturnType<typeof createTwitchAdFilter>; tokenBodies: string[]; log: string[] }> {
  const { fetch, tokenBodies } = fakeTwitch(backupPlaylist)
  const log: string[] = []
  const filter = createTwitchAdFilter(fetch, (m) => log.push(m))
  filter.onMaster(USHER, masterWith(PLAYER_720))
  await new Promise((r) => setTimeout(r, 10)) // backup copies get ready in the background
  return { filter, tokenBodies, log }
}

describe('Twitch ad filter', () => {
  it('passes playlists without ads through', async () => {
    const { filter } = await started(null)
    const p = [head, seg('p', 1), seg('p', 2)].join('\n')
    expect(await filter.onMediaPlaylist(PLAYER_720, p)).toContain('p2.ts')
  })

  it('plays the ad-free backup copy during an ad break, at the same quality', async () => {
    const { filter, log } = await started([head, seg('b', 3), seg('b', 4)].join('\n'))
    await filter.onMediaPlaylist(PLAYER_720, [head, seg('p', 1), seg('p', 2)].join('\n'))
    const out = await filter.onMediaPlaylist(PLAYER_720, [head, seg('p', 2), adBreak, seg('p', 3, 'Amazon'), seg('p', 4, 'Amazon')].join('\n'))
    expect(out).toContain('b3.ts')
    expect(out).toContain('#EXT-X-DISCONTINUITY')
    expect(out).not.toMatch(/Amazon|stitched/)
    expect(log.some((m) => m.includes('playing the ad-free stream (embed/web)'))).toBe(true)
  })

  it('reuses the player’s own token request headers for backup tokens', async () => {
    const { fetch } = fakeTwitch(null)
    const headersSeen: Array<Record<string, string>> = []
    const filter = createTwitchAdFilter(async (input, init) => {
      if (input.startsWith('https://gql')) headersSeen.push(init?.headers as Record<string, string>)
      return fetch(input, init)
    })
    const body = JSON.stringify({ operationName: 'PlaybackAccessToken', variables: { login: 'SomeChannel', isLive: true } })
    const headers: Record<string, string> = { 'client-id': 'cid', 'client-integrity': 'integrity', cookie: 'nope' }
    filter.rememberTokenRequest((h) => headers[h], body)
    filter.onMaster(USHER, masterWith(PLAYER_720))
    await new Promise((r) => setTimeout(r, 10))
    expect(headersSeen[0]).toMatchObject({ 'client-id': 'cid', 'client-integrity': 'integrity' })
    expect(headersSeen[0]).not.toHaveProperty('cookie')
  })

  it('cuts the ads when every backup copy has ads too', async () => {
    const { filter, log } = await started([head, adBreak, seg('b', 3, 'Amazon')].join('\n'))
    const out = await filter.onMediaPlaylist(PLAYER_720, [head, seg('p', 1), adBreak, seg('p', 3, 'Amazon')].join('\n'))
    expect(out).toContain('p1.ts')
    expect(out).not.toContain('Amazon')
    expect(log.at(-1)).toMatch(/skipped 1 ad segment/)
  })

  it('holds the last ad-free playlist through a mid-roll that fills the whole playlist', async () => {
    const { filter } = await started(null)
    const before = await filter.onMediaPlaylist(PLAYER_720, [head, seg('p', 1), seg('p', 2)].join('\n'))
    const during = await filter.onMediaPlaylist(PLAYER_720, [head, adBreak, seg('p', 3, 'Amazon'), seg('p', 4, 'Amazon')].join('\n'))
    expect(during).toBe(before)
  })

  it('lets a pre-roll through so the stream starts, when nothing ad-free is available', async () => {
    const { filter } = await started(null)
    const preroll = [head, adBreak, seg('p', 1, 'Amazon')].join('\n')
    expect(await filter.onMediaPlaylist(PLAYER_720, preroll)).toContain('p1.ts')
  })

  it('builds a backup master URL with the new token for the same channel', async () => {
    const { filter } = await started('')
    const url = await filter.backupMasterUrl(USHER, { playerType: 'embed', platform: 'web' })
    expect(url).toMatch(/^https:\/\/usher\.ttvnw\.net\/api\/channel\/hls\/somechannel\.m3u8\?/)
    expect(new URL(url!).searchParams.get('token')).toBe('tok')
    expect(await filter.backupMasterUrl('https://example.com/x.m3u8', { playerType: 'embed', platform: 'web' })).toBeNull()
  })
})
