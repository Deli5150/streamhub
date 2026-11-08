import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCount, rumbleEmbedId } from '@shared/urls'
import {
  parseTwitchMedia,
  parseTwitchTogether,
  twitchMentions,
  parseKickAbout,
  parseRumbleDescription,
  parseTwitchAbout,
  parseYouTubeDescription,
  parseKickFollowed,
  parseKickLivestream,
  parseRumbleGrid,
  parseKickVideos,
  parseKickClips,
  parseTimeAgo,
  formatDuration,
  formatViews,
  parseRumbleMenu,
  parseRumbleVideoPage,
  parseYouTubeLive,
  parseYouTubeRss,
  extractYtInitialData,
  youTubeSignedOut
} from '../src/main/providers/parsers'

const fixture = (name: string): string => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')

describe('rumble', () => {
  it('reads only the Following section of the nav menu, with avatars and live state', () => {
    const menu = parseRumbleMenu(fixture('rumble-menu.html'))
    expect(menu).toEqual([
      {
        displayName: 'Badlands Media',
        avatarUrl: 'https://hugh.cdn.rumble.cloud/video/z8/d/l/n/e/dlnea.baa.9-BadlandsMedia-td6z09.png',
        live: { videoPath: '/v7hfccm-baseless-conspiracies-ep.-208.html', viewers: 3190 }
      },
      { displayName: 'Dan Bongino', id: 'c/bongino', avatarUrl: 'https://hugh.cdn.rumble.cloud/avatar-offline.png' }
    ])
  })

  it('splits the channel video grid into past streams and uploads', () => {
    const grid = {
      items: [
        { object_type: 'video', id: 448852782, title: 'Ep 2624', thumb: 'https://t/a.jpg', duration: 4025, views: 426231, upload_date: '2026-10-26T12:17:51+00:00', live_streamed_on: '2026-10-26T14:00:24+00:00', live: false },
        { object_type: 'video', id: 448640784, title: 'Weekend Report', thumb: 'https://t/b.jpg', duration: 3233, views: 158238, upload_date: '2026-10-24T11:01:00+00:00', live_streamed_on: null, live: false },
        { object_type: 'video', id: 85324457, title: 'Live now', live: true }
      ]
    }
    const html = `<rum-videos-grid><script type="application/json">${JSON.stringify(grid)}</script></rum-videos-grid>`
    const page = parseRumbleGrid(html)
    expect(page.count).toBe(3)
    expect(page.streams).toHaveLength(1)
    expect(page.streams[0]).toMatchObject({ id: '448852782', kind: 'vod', durationText: '1:07:05', viewCountText: '426.2K views', playUrl: 'https://rumble.com/embed/v7f8h0u/?autoplay=2' })
    expect(page.videos).toEqual([expect.objectContaining({ id: '448640784', kind: 'video', durationText: '53:53' })])
  })

  it('maps numeric video ids to embed ids', () => {
    // Verified against rumble.com: data-video-id 448852782 ↔ embed/v7f8h0u
    expect(rumbleEmbedId('448852782')).toBe('v7f8h0u')
  })

  it('reads video ids and channel from a watch page', () => {
    const html =
      '<div data-video-id="448852782"></div><a class="media-by--a" href="/c/Bongino?e9s=src">Dan</a><title>Ep 1</title>' +
      '<script type="application/ld+json">{"thumbnailUrl":"https:\\/\\/hugh.cdn.rumble.cloud\\/video\\/a.jpg"}</script>'
    expect(parseRumbleVideoPage(html)).toEqual({
      numericId: '448852782',
      channelId: 'c/bongino',
      title: 'Ep 1',
      thumbnail: 'https://hugh.cdn.rumble.cloud/video/a.jpg'
    })
  })
})

describe('kick', () => {
  it('parses the followed-channels response', () => {
    const res = parseKickFollowed({
      nextCursor: null,
      channels: [
        { channel_slug: 'xqc', user_username: 'xQc', profile_picture: 'https://files.kick.com/x.webp', is_live: true, viewer_count: 10450, session_title: 'drama', category_name: 'Just Chatting' },
        { channel_slug: 'trainwreckstv', user_username: 'Trainwreckstv', profile_picture: null, is_live: false }
      ]
    })
    expect(res.channels.map((c) => c.key)).toEqual(['kick:xqc', 'kick:trainwreckstv'])
    expect(res.channels[1].avatarUrl).toBeUndefined()
    expect(res.live).toEqual([{ key: 'kick:xqc', title: 'drama', viewers: 10450, category: 'Just Chatting' }])
  })

  it('parses past streams (skipping the live one) and paged clips', () => {
    const vods = parseKickVideos([
      { is_live: true, session_title: 'now', source: 'https://x/live.m3u8', video: { uuid: 'live' } },
      { is_live: false, session_title: 'yesterday', duration: 3_723_000, views: 1500, source: 'https://x/vod.m3u8', created_at: '2026-10-25 10:00:00', thumbnail: { src: 'https://t/v.webp' }, video: { uuid: 'abc', views: 1500 } }
    ])
    expect(vods).toEqual([
      expect.objectContaining({ id: 'abc', kind: 'vod', durationText: '1:02:03', viewCountText: '1.5K views', hlsUrl: 'https://x/vod.m3u8', publishedAt: '2026-10-25T10:00:00Z' })
    ])
    const clips = parseKickClips({ clips: [{ id: 'clip_1', title: 'nice', duration: 30, views: 1, video_url: 'https://c/1.m3u8', created_at: '2026-10-27T05:46:15Z' }], nextCursor: { view: 0, id: 'clip_1' } })
    expect(clips.items[0]).toMatchObject({ id: 'clip_1', kind: 'clip', durationText: '0:30', viewCountText: '1 view', hlsUrl: 'https://c/1.m3u8' })
    expect(clips.cursor).toBe('{"view":0,"id":"clip_1"}')
    expect(parseKickClips({ clips: [], nextCursor: null }).cursor).toBeNull()
  })

  it('parses the livestream lookup (thumbnail, viewers, category)', () => {
    const live = parseKickLivestream(
      {
        data: {
          session_title: 'hi',
          viewers: 5,
          created_at: '2026-10-26 20:59:33',
          category: { name: 'GTA V' },
          thumbnail: { src: 'https://images.kick.com/video_thumbnails/a/b/720.webp' }
        }
      },
      'xqc'
    )
    expect(live).toEqual({
      key: 'kick:xqc',
      title: 'hi',
      viewers: 5,
      thumbnail: 'https://images.kick.com/video_thumbnails/a/b/720.webp',
      category: 'GTA V',
      startedAt: '2026-10-26T20:59:33Z'
    })
    expect(parseKickLivestream({ data: null }, 'xqc')).toBeUndefined()
  })
})

describe('youtube', () => {
  it('parses the RSS feed', () => {
    const entries = parseYouTubeRss(fixture('youtube.xml'))
    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({
      videoId: 'abc123DEF45',
      title: 'Live: building a game',
      published: '2026-10-26T18:00:00+00:00',
      thumbnail: 'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg'
    })
  })
})

describe('youtube signed-in pages', () => {
  it('extracts ytInitialData and finds live items in both renderer shapes', () => {
    const data = {
      contents: [
        { videoRenderer: {
            videoId: 'rFZHOHl-L8A', title: { runs: [{ text: 'lofi hip hop radio' }] },
            ownerText: { runs: [{ navigationEndpoint: { browseEndpoint: { browseId: 'UCSJ4gkVC6NrvII8umztf0Ow' } } }] },
            viewCountText: { runs: [{ text: '18,109' }, { text: ' watching' }] },
            badges: [{ metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_LIVE_NOW', label: 'LIVE' } }] } },
        { lockupViewModel: {
            contentId: 'abcdefghijk',
            metadata: { lockupMetadataViewModel: { title: { content: 'New layout stream' },
              byline: { commandRuns: [{ onTap: { innertubeCommand: { browseEndpoint: { browseId: 'UCxxxxxxxxxxxxxxxxxxxxxx' } } } }] } } },
            overlay: { badge: { badgeStyle: 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE', text: '1.2K watching' } } } },
        { videoRenderer: {
            videoId: 'upcoming123', title: { simpleText: 'Premieres soon' },
            ownerText: { runs: [{ navigationEndpoint: { browseEndpoint: { browseId: 'UCyyyyyyyyyyyyyyyyyyyyyy' } } }] },
            thumbnailOverlays: [{ thumbnailOverlayTimeStatusRenderer: { style: 'UPCOMING' } }] } }
      ]
    }
    const html = `<script>var ytInitialData = ${JSON.stringify(data)};</script><script>ytcfg.set({"LOGGED_IN":true})</script>`
    expect(youTubeSignedOut(html)).toBe(false)
    expect(parseYouTubeLive(extractYtInitialData(html))).toEqual([
      { channelId: 'UCSJ4gkVC6NrvII8umztf0Ow', title: 'lofi hip hop radio', viewers: 18109, streamId: 'rFZHOHl-L8A', thumbnail: 'https://i.ytimg.com/vi/rFZHOHl-L8A/mqdefault.jpg' },
      { channelId: 'UCxxxxxxxxxxxxxxxxxxxxxx', title: 'New layout stream', viewers: 1200, streamId: 'abcdefghijk', thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg' }
    ])
  })

  it('handles braces inside strings when extracting', () => {
    const html = 'var ytInitialData = {"a":"}{ \\" }","b":{"c":1}};var other = {}'
    expect(extractYtInitialData(html)).toEqual({ a: '}{ " }', b: { c: 1 } })
  })
})

describe('media formatting', () => {
  it('formats durations and view counts', () => {
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(3723)).toBe('1:02:03')
    expect(formatViews(1)).toBe('1 view')
    expect(formatViews(28000)).toBe('28K views')
    expect(formatViews(2_500_000)).toBe('2.5M views')
  })

  it('turns "… ago" text into an approximate date', () => {
    const now = Date.parse('2026-10-27T12:00:00Z')
    expect(parseTimeAgo('19 days ago', now)).toBe('2026-10-08T12:00:00.000Z')
    expect(parseTimeAgo('Streamed 6 hours ago', now)).toBe('2026-10-27T06:00:00.000Z')
    expect(parseTimeAgo('Yesterday', now)).toBe('2026-10-26T12:00:00.000Z')
    expect(parseTimeAgo('Streamed 4y ago', now)).toBe(new Date(now - 4 * 31536000_000).toISOString())
    expect(parseTimeAgo('10mo ago', now)).toBe(new Date(now - 10 * 2592000_000).toISOString())
    expect(parseTimeAgo('5m ago', now)).toBe('2026-10-27T11:55:00.000Z')
    expect(parseTimeAgo('2w ago', now)).toBe('2026-10-13T12:00:00.000Z')
    expect(parseTimeAgo('Oct 3, 2026', now)).toBeUndefined()
  })
})

describe('shared', () => {
  it('parses abbreviated counts', () => {
    expect(parseCount('3.19K')).toBe(3190)
    expect(parseCount('1,234')).toBe(1234)
    expect(parseCount('2.5M viewers')).toBe(2_500_000)
    expect(parseCount('')).toBeUndefined()
  })
})

describe('about sections and stream descriptions', () => {
  it('reads a Twitch bio, socials and panels, skipping extension and empty panels', () => {
    const about = parseTwitchAbout({
      data: {
        user: {
          description: ' I am back ',
          panels: [
            { type: 'DEFAULT', title: null, description: null, imageURL: 'https://panels.twitch.tv/a.png', linkURL: 'https://x.com/s' },
            { type: 'DEFAULT', title: null, description: null, imageURL: null, linkURL: null },
            { type: 'EXTENSION' },
            { type: 'DEFAULT', title: 'Merch', description: 'Now open! [Shop](https://shop.example.com)', imageURL: null, linkURL: null }
          ],
          channel: { socialMedias: [{ name: 'Youtube', title: 'Cohh on YouTube', url: 'https://youtube.com/c' }, { name: 'site', title: null, url: 'https://www.example.org/' }] }
        }
      }
    })
    expect(about).toEqual({
      kind: 'about',
      text: 'I am back',
      links: [
        { title: 'Cohh on YouTube', url: 'https://youtube.com/c' },
        { title: 'site', url: 'https://www.example.org/' }
      ],
      panels: [
        { imageUrl: 'https://panels.twitch.tv/a.png', linkUrl: 'https://x.com/s' },
        { title: 'Merch', text: 'Now open! [Shop](https://shop.example.com)' }
      ]
    })
  })

  it('handles a Twitch user that does not exist', () => {
    expect(parseTwitchAbout({ data: { user: null } })).toEqual({ kind: 'about', links: [], panels: [] })
  })

  it('reads a Kick bio, turns social handles into links, and keeps About panels', () => {
    const about = parseKickAbout(
      { user: { bio: 'THE JUICER.', instagram: 'xqcow1/', twitter: 'xqc', youtube: 'channel/UCm', discord: 'xqcow', tiktok: '', facebook: '' } },
      [{ title: '', description: '', link: 'https://streamelements.com/xqc/tip', image: { url: 'https://files.kick.com/a.webp' } }, { title: '', description: '' }]
    )
    expect(about.text).toBe('THE JUICER.')
    expect(about.links).toEqual([
      { title: 'Instagram', url: 'https://instagram.com/xqcow1/' },
      { title: 'X', url: 'https://x.com/xqc' },
      { title: 'YouTube', url: 'https://youtube.com/channel/UCm' },
      { title: 'Discord', url: 'https://discord.gg/xqcow' }
    ])
    expect(about.panels).toEqual([{ imageUrl: 'https://files.kick.com/a.webp', linkUrl: 'https://streamelements.com/xqc/tip' }])
  })

  it('reads the full description from a YouTube watch page', () => {
    const html = `<script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"abc","shortDescription":"Line one \\"quoted\\"\\n→ https://link.example.com\\n","isLive":true}};</script>`
    expect(parseYouTubeDescription(html)).toEqual({ kind: 'description', text: 'Line one "quoted"\n→ https://link.example.com', links: [], panels: [] })
    expect(parseYouTubeDescription('<html></html>').text).toBeUndefined()
  })

  it('reads the Rumble description box with line breaks and link addresses', () => {
    const html = `
      <p class="media-description media-description--first">In this episode, I cover the news.</p>
      <p class="media-description media-description--more">Sponsors:<br>Dose - <a href="https://dosedaily.co/bongino" rel="nofollow">https://dosedaily.co/bongino</a> - code: bongino<br>Merch: <a href="https://store.example.com/very/long/path">https://store.example.com/very/lo…</a></p>
      <p class="media-description media-description--more">Watch <a href="/c/Bongino">my channel</a></p>
      <p class="media-description media-description--more">Email us at <a href="/cdn-cgi/l/email-protection" class="__cf_email__">[email&nbsp;protected]</a></p>
      <p class="media-description media-description--more"></p>`
    expect(parseRumbleDescription(html).text).toBe(
      [
        'In this episode, I cover the news.',
        'Sponsors:\nDose - https://dosedaily.co/bongino - code: bongino\nMerch: https://store.example.com/very/long/path',
        'Watch [my channel](https://rumble.com/c/Bongino)',
        'Email us at'
      ].join('\n\n')
    )
  })
})

describe('twitch stream together', () => {
  it('finds @mentions in a title, but not emails or the bare @', () => {
    expect(twitchMentions('collab w/ @Cinna and @fanfan_ today! mail me@example.com @ @abc @Cinna')).toEqual(['cinna', 'fanfan_'])
    expect(twitchMentions(undefined)).toEqual([])
  })

  it('lists who is streaming together, then real mentions, without the channel itself', () => {
    const together = parseTwitchTogether('emiru', {
      data: {
        costream: {
          organizer: { login: 'playapex', displayName: 'playapex', stream: { id: '9' } },
          topCostreamers: [{ login: 'emiru', displayName: 'emiru', stream: { id: '1' } }, { login: 'cinna', displayName: 'cinna', stream: { id: '2' } }]
        },
        sharedChat: {
          participants: [
            { channel: { owner: { login: 'emiru', displayName: 'emiru', stream: { id: '1' } } } },
            { channel: { owner: { login: 'Cinna', displayName: 'cinna', profileImageURL: 'https://x/c.png', stream: { id: '2' } } } }
          ]
        },
        guestStar: { host: { login: 'emiru' }, guests: [{ user: { login: 'fanfan', displayName: 'Fanfan', stream: null } }] },
        mention0: { login: 'cinna', displayName: 'cinna', stream: { id: '2' } },
        mention1: null,
        mention2: { login: 'quarterjade', displayName: 'QuarterJade', stream: null }
      }
    })
    expect(together).toEqual([
      { platform: 'twitch', login: 'playapex', displayName: 'playapex', avatarUrl: undefined, live: true, reason: 'together' },
      { platform: 'twitch', login: 'cinna', displayName: 'cinna', avatarUrl: undefined, live: true, reason: 'together' },
      { platform: 'twitch', login: 'fanfan', displayName: 'Fanfan', avatarUrl: undefined, live: false, reason: 'together' },
      { platform: 'twitch', login: 'quarterjade', displayName: 'QuarterJade', avatarUrl: undefined, live: false, reason: 'mention' }
    ])
    expect(parseTwitchTogether('emiru', { data: { sharedChat: null } })).toEqual([])
  })
})

describe('twitch channel page from the API', () => {
  it('reads past broadcasts and clips with player links, and whether there are more', () => {
    const page = parseTwitchMedia({
      data: {
        user: {
          videos: {
            edges: [
              { node: { id: '2914133141', title: 'BUNNY D.VA', lengthSeconds: 24212, viewCount: 8429, publishedAt: '2026-10-29T18:38:59Z', previewThumbnailURL: 'https://x/thumb.jpg' } },
              { node: null },
              { node: { id: '2900000000', title: '', lengthSeconds: 0, viewCount: 1, publishedAt: undefined } }
            ],
            pageInfo: { hasNextPage: true }
          },
          clipsAll: {
            edges: [{ node: { slug: 'OddNastyVanilla-ls', title: 'Human cheat code', durationSeconds: 30, viewCount: 648345, createdAt: '2022-02-27T23:25:33Z', thumbnailURL: 'https://x/c.jpg' } }],
            pageInfo: { hasNextPage: false }
          }
        }
      }
    })!
    expect(page.moreStreams).toBe(true)
    expect(page.moreClips).toBe(false)
    expect(page.streams[0]).toMatchObject({
      id: '2914133141',
      kind: 'vod',
      title: 'BUNNY D.VA',
      thumbnail: 'https://x/thumb.jpg',
      durationText: '6:43:32',
      viewCountText: '8.4K views',
      publishedAt: '2026-10-29T18:38:59Z',
      playUrl: 'https://player.twitch.tv/?video=v2914133141&parent=twitch.tv&player=popout&autoplay=true'
    })
    expect(page.streams[1]).toMatchObject({ title: 'Past broadcast', viewCountText: '1 view', durationText: undefined, publishedText: undefined })
    expect(page.clips).toEqual([
      expect.objectContaining({ id: 'OddNastyVanilla-ls', kind: 'clip', durationText: '0:30', viewCountText: '648.3K views', playUrl: 'https://clips.twitch.tv/embed?clip=OddNastyVanilla-ls&parent=twitch.tv&autoplay=true' })
    ])
  })

  it('merges the top clips of the last day, week, month and all time, newest first, each once', () => {
    const clip = (slug: string, createdAt: string, viewCount = 10) => ({ node: { slug, title: slug, durationSeconds: 20, viewCount, createdAt } })
    const page = parseTwitchMedia({
      data: {
        user: {
          videos: { edges: [], pageInfo: { hasNextPage: false } },
          clipsDay: { edges: [clip('today', '2026-10-29T20:00:00Z')] },
          clipsWeek: { edges: [clip('today', '2026-10-29T20:00:00Z'), clip('monday', '2026-10-26T12:00:00Z')] },
          clipsMonth: { edges: [clip('earlyoct', '2026-10-03T12:00:00Z'), clip('monday', '2026-10-26T12:00:00Z')] },
          clipsAll: { edges: [clip('classic', '2022-02-27T23:25:33Z', 648345), clip('earlyoct', '2026-10-03T12:00:00Z')], pageInfo: { hasNextPage: true } }
        }
      }
    })!
    expect(page.clips.map((c) => c.id)).toEqual(['today', 'monday', 'earlyoct', 'classic'])
    // "Load more" continues the all-time list from where the API stopped.
    expect(page.allTimeClips).toBe(2)
    expect(page.moreClips).toBe(true)
  })

  it('still uses the other clip lists when one failed, and lets "Load more" start the all-time list over', () => {
    const page = parseTwitchMedia({
      data: { user: { videos: { edges: [], pageInfo: { hasNextPage: false } }, clipsWeek: null, clipsAll: null, clipsDay: { edges: [{ node: { slug: 'today', createdAt: '2026-10-29T20:00:00Z' } }] } } }
    })!
    expect(page.clips.map((c) => c.id)).toEqual(['today'])
    expect(page).toMatchObject({ moreClips: true, allTimeClips: 0 })
  })

  it('gives up (so the page reader is used) when the channel is missing or Twitch errs', () => {
    expect(parseTwitchMedia({ data: { user: null } })).toBeNull()
    expect(parseTwitchMedia({ data: { user: { videos: null, clipsAll: { edges: [] } } } })).toBeNull()
    expect(parseTwitchMedia({})).toBeNull()
  })
})
