import { describe, expect, it } from 'vitest'
import type { MediaItem, SavedItem } from '../src/shared/types'
import { convertToVod, durationSeconds, newestRecording } from '../src/main/watchLater'

const vod = (id: string, publishedAt: string): MediaItem => ({ id, kind: 'vod', title: `Stream ${id}`, publishedAt, playUrl: `https://x/${id}` })
const hour = 3600_000

describe('newestRecording', () => {
  const now = Date.now()
  const streams = [vod('cur', new Date(now - 2 * hour).toISOString()), vod('prev', new Date(now - 30 * hour).toISOString())]

  it('skips the in-progress recording of a live stream (Twitch/Kick)', () => {
    const live = { key: 'twitch:a', title: '', startedAt: new Date(now - 2 * hour).toISOString() }
    expect(newestRecording(streams, 'twitch', live)?.id).toBe('prev')
  })

  it('skips the live broadcast listed under its own id (YouTube, Rumble embed id)', () => {
    expect(newestRecording([vod('abc', ''), vod('old', '')], 'youtube', { key: 'y', title: '', streamId: 'abc' })?.id).toBe('old')
    expect(newestRecording([vod('100', ''), vod('99', '')], 'rumble', { key: 'r', title: '', streamId: 'v2s' })?.id).toBe('99')
  })

  it('skips the in-progress recording when the start time is unknown (Twitch)', () => {
    const inProgress = { ...vod('cur', new Date(now - 5 * hour).toISOString()), durationText: '4:32:02' }
    const previous = { ...vod('prev', new Date(now - 25 * hour).toISOString()), durationText: '8:11:20' }
    expect(newestRecording([inProgress, previous], 'twitch', { key: 't', title: '' })?.id).toBe('prev')
    expect(durationSeconds('1:02:03')).toBe(3723)
    expect(durationSeconds('12:05')).toBe(725)
  })

  it('takes the newest once offline', () => {
    expect(newestRecording(streams, 'twitch')?.id).toBe('cur')
  })
})

describe('convertToVod', () => {
  const ch: SavedItem = { id: 'channel:kick:a', kind: 'channel', channelKey: 'kick:a', platform: 'kick', displayName: 'A', savedAt: 1, baselineId: 'prev' }
  const other: SavedItem = { ...ch, id: 'channel:kick:b', channelKey: 'kick:b' }

  it('replaces the entry in place', () => {
    const out = convertToVod([other, ch], ch.id, vod('new', ''))
    expect(out.map((i) => i.id)).toEqual(['channel:kick:b', 'vod:kick:new'])
    expect(out[1]).toMatchObject({ kind: 'vod', title: 'Stream new', media: { id: 'new' }, baselineId: undefined })
  })

  it('drops the entry when the recording is already saved', () => {
    const saved = convertToVod([ch], ch.id, vod('new', ''))[0]
    expect(convertToVod([saved, { ...ch }], ch.id, vod('new', '')).map((i) => i.id)).toEqual(['vod:kick:new'])
  })
})
