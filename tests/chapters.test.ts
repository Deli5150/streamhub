import { describe, expect, it } from 'vitest'
import { parseYouTubeChapters } from '../src/main/providers/parsers'

const page = (data: unknown, description = ''): string =>
  `<script>var ytInitialData = ${JSON.stringify(data)};</script><script>var p = {"videoDetails":{"shortDescription":${JSON.stringify(description)}}}</script>`

const chapter = (title: string, ms: number) => ({ chapterRenderer: { title: { simpleText: title }, timeRangeStartMillis: ms, thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/${ms}.jpg` }] } } })

describe('YouTube chapters', () => {
  it('reads the player bar chapter markers, once each, in order', () => {
    const markers = [chapter('Intro', 0), chapter('Camera', 95_000), chapter('Battery', 300_400)]
    const html = page({ playerOverlays: { markersMap: [{ key: 'DESCRIPTION_CHAPTERS', value: { chapters: markers } }] }, copy: { chapters: markers.slice().reverse() } })
    expect(parseYouTubeChapters(html)).toEqual([
      { title: 'Intro', start: 0, thumbnail: 'https://i.ytimg.com/0.jpg' },
      { title: 'Camera', start: 95, thumbnail: 'https://i.ytimg.com/95000.jpg' },
      { title: 'Battery', start: 300, thumbnail: 'https://i.ytimg.com/300400.jpg' }
    ])
  })

  it('falls back to timestamps in the description', () => {
    const html = page({}, 'Thanks for watching!\n0:00 Intro\n1:35 - Camera\n(1:02:03) Wrap up\nfollow me')
    expect(parseYouTubeChapters(html)).toEqual([
      { title: 'Intro', start: 0 },
      { title: 'Camera', start: 95 },
      { title: 'Wrap up', start: 3723 }
    ])
  })

  it('has none for a description that only mentions a time or two', () => {
    expect(parseYouTubeChapters(page({}, 'Best part at 3:20\n5:00 another'))).toEqual([])
  })
})
