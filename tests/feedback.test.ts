import { describe, expect, it } from 'vitest'
import { feedbackUrl, feedbackWhere, redactLog } from '../src/shared/feedback'

const params = (url: string): URLSearchParams => new URL(url).searchParams

describe('feedbackUrl', () => {
  it('fills in the bug form', () => {
    const url = feedbackUrl({ kind: 'bug', title: ' Stuck fullscreen ', text: 'Esc in the queue', where: ['Windows'], version: '1.0.9', log: 'a\nb' })
    expect(url.startsWith('https://github.com/Deli5150/streamhub/issues/new?')).toBe(true)
    const q = params(url)
    expect(q.get('template')).toBe('bug.yml')
    expect(q.get('title')).toBe('Stuck fullscreen')
    expect(q.get('what')).toBe('Esc in the queue')
    expect(q.get('platform')).toBe('Windows')
    expect(q.get('version')).toBe('1.0.9')
    expect(q.get('extra')).toContain('a\nb')
  })

  it('fills in the feature form, without a log', () => {
    const q = params(feedbackUrl({ kind: 'feature', title: 'Cast', text: 'Please', where: ['Android'], version: '1.0.9', log: 'x' }))
    expect(q.get('template')).toBe('feature.yml')
    expect(q.get('idea')).toBe('Please')
    expect(q.has('extra')).toBe(false)
    expect(q.has('version')).toBe(false)
  })

  it('cuts a long log to fit, keeping the newest lines', () => {
    const log = Array.from({ length: 2000 }, (_, i) => `line ${i} ${'x'.repeat(20)}`).join('\n')
    const url = feedbackUrl({ kind: 'bug', title: 't', text: 'd', where: [], version: '1', log })
    expect(url.length).toBeLessThanOrEqual(7_500)
    expect(params(url).get('extra')).toContain('line 1999')
    expect(params(url).get('extra')).not.toContain('line 0 ')
  })
})

describe('feedbackWhere', () => {
  it('names the device as the forms do', () => {
    expect(feedbackWhere('bug', 'win32')).toEqual(['Windows'])
    expect(feedbackWhere('bug', 'linux', { steam: true, bigPicture: true })).toEqual(['Steam Deck / SteamOS', 'Big Picture mode'])
    expect(feedbackWhere('feature', 'darwin')).toEqual(['Desktop (Mac/Windows/Linux)'])
    expect(feedbackWhere('feature', 'android')).toEqual(['Android'])
  })
})

describe('redactLog', () => {
  it('takes out tokens, emails and the home folder', () => {
    const out = redactLog(
      'Authorization: OAuth abc123\nme@example.com\n/Users/someone/Library/x\nhttps://x.test/?token=s3cret&ok=1\nid 0123456789abcdef0123456789abcdef',
      '/Users/someone'
    )
    expect(out).not.toContain('abc123')
    expect(out).not.toContain('me@example.com')
    expect(out).not.toContain('someone')
    expect(out).not.toContain('s3cret')
    expect(out).not.toContain('0123456789abcdef0123456789abcdef')
    expect(out).toContain('~/Library/x')
    expect(out).toContain('ok=1')
    expect(redactLog('[kick] AuthError: kick: session expired')).toBe('[kick] AuthError: kick: session expired')
  })
})
