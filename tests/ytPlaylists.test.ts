import { describe, expect, it } from 'vitest'
import { parseYouTubePlaylistItems, parseYouTubePlaylistPage, parseYouTubePlaylists, parseYouTubePlaylistsPage } from '../src/main/providers/parsers'

describe('YouTube playlists (Data API)', () => {
  it('lists playlists with their size and best thumbnail', () => {
    const { playlists, next } = parseYouTubePlaylists({
      nextPageToken: 'P2',
      items: [
        { id: 'PL1', snippet: { title: 'Lofi', thumbnails: { default: { url: 'd' }, medium: { url: 'm' } } }, contentDetails: { itemCount: 12 } },
        { snippet: { title: 'no id' } }
      ]
    })
    expect(playlists).toEqual([{ id: 'PL1', title: 'Lofi', thumbnail: 'm', count: 12 }])
    expect(next).toBe('P2')
  })

  it('turns playlist videos into playable entries, skipping private and deleted ones', () => {
    const { items, next } = parseYouTubePlaylistItems({
      items: [
        {
          snippet: {
            title: 'Song',
            videoOwnerChannelId: 'UCa',
            videoOwnerChannelTitle: 'Artist - Topic',
            resourceId: { videoId: 'v1' },
            thumbnails: { high: { url: 'h' } }
          },
          status: { privacyStatus: 'public' }
        },
        { snippet: { title: 'Private video', resourceId: { videoId: 'v2' } }, status: { privacyStatus: 'private' } },
        { snippet: { title: 'Deleted video', resourceId: { videoId: 'v3' } }, status: { privacyStatus: 'public' } }
      ]
    })
    expect(next).toBeNull()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'vod:youtube:v1',
      kind: 'vod',
      channelKey: 'youtube:UCa',
      platform: 'youtube',
      displayName: 'Artist',
      title: 'Song',
      thumbnail: 'h',
      media: { id: 'v1', kind: 'video', playUrl: 'https://www.youtube.com/embed/v1?autoplay=1' }
    })
  })
})

describe('YouTube playlists (web pages)', () => {
  it('reads the playlists feed in both page shapes', () => {
    const data = {
      contents: [
        {
          lockupViewModel: {
            contentId: 'PLnew',
            contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST',
            metadata: { lockupMetadataViewModel: { title: { content: 'New shape' } } },
            contentImage: { image: { sources: [{ url: 'https://i.ytimg.com/vi/a/hqdefault.jpg' }] }, overlays: [{ text: '7 videos' }] }
          }
        },
        { lockupViewModel: { contentId: 'vid', contentType: 'LOCKUP_CONTENT_TYPE_VIDEO' } },
        { gridPlaylistRenderer: { playlistId: 'PLold', title: { runs: [{ text: 'Old shape' }] }, videoCountShortText: { simpleText: '1,204' } } }
      ]
    }
    expect(parseYouTubePlaylistsPage(data)).toEqual([
      { id: 'PLnew', title: 'New shape', thumbnail: 'https://i.ytimg.com/vi/a/hqdefault.jpg', count: 7 },
      { id: 'PLold', title: 'Old shape', thumbnail: undefined, count: 1204 }
    ])
  })

  it("reads a playlist page's playable videos", () => {
    const video = (id: string, extra: Record<string, unknown> = {}): unknown => ({
      playlistVideoRenderer: {
        videoId: id,
        title: { runs: [{ text: `Video ${id}` }] },
        shortBylineText: { runs: [{ text: 'Chan', navigationEndpoint: { browseEndpoint: { browseId: 'UCx' } } }] },
        lengthText: { simpleText: '3:21' },
        thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/a/default.jpg?x=1' }, { url: 'https://i.ytimg.com/vi/a/mq.jpg?x=2' }] },
        ...extra
      }
    })
    const data = {
      metadata: { playlistMetadataRenderer: { title: 'Mix' } },
      contents: [video('a'), video('b', { shortBylineText: undefined }), video('a'), video('c', { isPlayable: false })]
    }
    const page = parseYouTubePlaylistPage(data)
    expect(page.title).toBe('Mix')
    expect(page.items.map((i) => i.media?.id)).toEqual(['a'])
    expect(page.items[0]).toMatchObject({
      displayName: 'Chan',
      channelKey: 'youtube:UCx',
      thumbnail: 'https://i.ytimg.com/vi/a/mq.jpg',
      media: { durationText: '3:21' }
    })
  })

  it("reads a playlist page's videos in the new lockup shape", () => {
    const data = {
      contents: [
        {
          lockupViewModel: {
            contentId: 'abc',
            contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
            contentImage: {
              thumbnailViewModel: { overlays: [{ thumbnailBottomOverlayViewModel: { badges: [{ thumbnailBadgeViewModel: { text: '12:05' } }] } }] }
            },
            metadata: {
              lockupMetadataViewModel: {
                title: { content: 'Song' },
                metadata: {
                  contentMetadataViewModel: {
                    metadataRows: [
                      {
                        metadataParts: [
                          {
                            text: {
                              content: 'Artist',
                              commandRuns: [{ onTap: { innertubeCommand: { browseEndpoint: { browseId: 'UCabcdefghijklmnopqrstuv' } } } }]
                            }
                          }
                        ]
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      ]
    }
    expect(parseYouTubePlaylistPage(data).items).toEqual([
      expect.objectContaining({
        id: 'vod:youtube:abc',
        displayName: 'Artist',
        channelKey: 'youtube:UCabcdefghijklmnopqrstuv',
        title: 'Song',
        media: expect.objectContaining({ durationText: '12:05' })
      })
    ])
  })
})
