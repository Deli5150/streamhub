import { describe, expect, it } from 'vitest'
import { customEmotesIn, emotesInChatPage, kickMessage, parseIrc } from '../src/shared/chatText'

describe('parseIrc', () => {
  it('reads tags, command and the trailing text', () => {
    const l = parseIrc('@msg-id=msg_followersonly;room-id=1 :tmi.twitch.tv NOTICE #xqc :This room is in followers-only mode.')
    expect(l.command).toBe('NOTICE')
    expect(l.tags['msg-id']).toBe('msg_followersonly')
    expect(l.params).toEqual(['#xqc', 'This room is in followers-only mode.'])
  })

  it('handles lines without tags or trailing text', () => {
    expect(parseIrc(':tmi.twitch.tv 001 me :Welcome, GLHF!')).toEqual({ tags: {}, command: '001', params: ['me', 'Welcome, GLHF!'] })
    expect(parseIrc('@emote-sets=0 :tmi.twitch.tv USERSTATE #xqc')).toMatchObject({ command: 'USERSTATE', params: ['#xqc'] })
  })
})

describe('kickMessage', () => {
  const ids = new Map([
    ['xqcL', 101],
    ['emojiAngel', 7]
  ])
  it('turns emote names into Kick emote codes', () => {
    expect(kickMessage('hi xqcL emojiAngel', ids)).toBe('hi [emote:101:xqcL] [emote:7:emojiAngel]')
  })
  it('leaves other words and partial matches alone', () => {
    expect(kickMessage('xqcLOL is not xqcL!', ids)).toBe('xqcLOL is not xqcL!')
    expect(kickMessage('plain text', undefined)).toBe('plain text')
  })
})

describe('emotesInChatPage', () => {
  const emoji = (id: string, code: string): object => ({ emoji: { emojiId: id, shortcuts: [code], isCustomEmoji: true, image: { thumbnails: [{ url: 'https://yt3.ggpht.com/a=w24' }, { url: 'https://yt3.ggpht.com/a=w48' }] } } })
  const page = (data: object): string => `<script>window["ytInitialData"] = ${JSON.stringify(data)};</script>`
  it("finds YouTube's and the channel's emotes in recent messages, with their owner", () => {
    const html = page({ actions: [{ message: { runs: [{ text: 'hi ' }, emoji('UCkszU2WH9gy1mb0dV-11UJg/x', ':yt:'), emoji('UCchan/y', ':_Hype:'), { emoji: { emojiId: '😂', shortcuts: [':joy:'] } }] } }] })
    expect(emotesInChatPage(html)).toEqual([
      { owner: 'UCkszU2WH9gy1mb0dV-11UJg', code: ':yt:', url: 'https://yt3.ggpht.com/a=w48', locked: false },
      { owner: 'UCchan', code: ':_Hype:', url: 'https://yt3.ggpht.com/a=w48', locked: false }
    ])
  })
  it("reads a comment section's emote list, with the ones you haven't unlocked", () => {
    const list = { commentsHeaderRenderer: { customEmojis: [{ emojiId: 'UCchan/z', shortcuts: [':_Wave:'], isLocked: true, image: { thumbnails: [{ url: 'https://yt3.ggpht.com/b' }] } }] } }
    expect(customEmotesIn(list)).toEqual([{ owner: 'UCchan', code: ':_Wave:', url: 'https://yt3.ggpht.com/b', locked: true }])
  })
  it('gives nothing for a page without chat data', () => {
    expect(emotesInChatPage('<html></html>')).toEqual([])
  })
})
