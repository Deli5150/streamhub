import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { authUrl, pkcePair } from '../src/main/googleAuth'
import { parseYouTubeResolve, parseYouTubeSubscriptions, parseYouTubeVideoStatuses } from '../src/main/providers/parsers'

describe('google sign-in', () => {
  it('makes a PKCE pair whose challenge is the SHA-256 of the verifier', () => {
    const { verifier, challenge } = pkcePair()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    expect(challenge).toBe(crypto.createHash('sha256').update(verifier).digest('base64url'))
    expect(pkcePair().verifier).not.toBe(verifier)
  })

  it('asks Google for read-only YouTube access with a loopback redirect, PKCE and offline access', () => {
    const url = new URL(authUrl({ clientId: 'abc.apps.googleusercontent.com', redirectUri: 'http://127.0.0.1:53127', challenge: 'CH', state: 'ST', scope: 'https://www.googleapis.com/auth/youtube.readonly' }))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'abc.apps.googleusercontent.com',
      redirect_uri: 'http://127.0.0.1:53127',
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.readonly',
      code_challenge: 'CH',
      code_challenge_method: 'S256',
      state: 'ST',
      access_type: 'offline',
      prompt: 'consent'
    })
  })
})

describe('youtube data api', () => {
  it('reads a page of subscriptions and the next page token', () => {
    expect(
      parseYouTubeSubscriptions({
        nextPageToken: 'CDIQAA',
        items: [
          { snippet: { title: 'Lofi Girl', resourceId: { channelId: 'UCSJ4gkVC6NrvII8umztf0Ow' }, thumbnails: { default: { url: 'https://yt3/d.jpg' }, medium: { url: 'https://yt3/m.jpg' } } } },
          { snippet: { title: 'No id', resourceId: {} } }
        ]
      })
    ).toEqual({
      channels: [{ key: 'youtube:UCSJ4gkVC6NrvII8umztf0Ow', platform: 'youtube', id: 'UCSJ4gkVC6NrvII8umztf0Ow', displayName: 'Lofi Girl', avatarUrl: 'https://yt3/m.jpg' }],
      next: 'CDIQAA'
    })
    expect(parseYouTubeSubscriptions({ items: [] }).next).toBeNull()
  })

  it('finds which videos are live, and records the rest (ended streams as final)', () => {
    const { status, live } = parseYouTubeVideoStatuses({
      items: [
        {
          id: 'jfKfPfyJRdk',
          snippet: { channelId: 'UCSJ4gkVC6NrvII8umztf0Ow', title: 'lofi hip hop radio', liveBroadcastContent: 'live', thumbnails: { high: { url: 'https://i.ytimg.com/h.jpg' } } },
          liveStreamingDetails: { actualStartTime: '2026-10-01T00:00:00Z', concurrentViewers: '41234' }
        },
        { id: 'upcoming1', snippet: { channelId: 'UCx', title: 'Soon', liveBroadcastContent: 'upcoming' }, liveStreamingDetails: {} },
        // Ended streams can still say "live" briefly; the end time wins.
        { id: 'ended1', snippet: { channelId: 'UCx', title: 'Was live', liveBroadcastContent: 'live' }, liveStreamingDetails: { actualStartTime: 'x', actualEndTime: 'y' } },
        { id: 'upload1', snippet: { channelId: 'UCx', title: 'A video', liveBroadcastContent: 'none' } }
      ]
    })
    expect(Object.fromEntries(status)).toEqual({ jfKfPfyJRdk: 'live', upcoming1: 'upcoming', ended1: 'none', upload1: 'none' })
    expect(live).toEqual([
      { key: 'youtube:UCSJ4gkVC6NrvII8umztf0Ow', title: 'lofi hip hop radio', viewers: 41234, startedAt: '2026-10-01T00:00:00Z', thumbnail: 'https://i.ytimg.com/h.jpg', streamId: 'jfKfPfyJRdk' }
    ])
  })

  it("reads the video a channel's /live page leads to, or none", () => {
    expect(parseYouTubeResolve({ endpoint: { watchEndpoint: { videoId: '0sfDth4lMLc' } } })).toBe('0sfDth4lMLc')
    expect(parseYouTubeResolve({ endpoint: { browseEndpoint: { browseId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw' } } })).toBeNull()
    expect(parseYouTubeResolve({})).toBeNull()
  })
})
