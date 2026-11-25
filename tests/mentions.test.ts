import { describe, expect, it } from 'vitest'
import { CHATTER_NAMES, MATCH_JS, matchMentions, mentionAt, mentionHelperScript } from '../src/shared/mentions'

const inPage = new Function(`return (${MATCH_JS})`)() as (names: string[], q: string) => string[]
const names = ['Alice', 'bob_99', 'Alfred', 'malice', 'ALBERT', 'carol', 'al', 'xal1', 'yal2', 'zal3', 'wal4', 'val5']

describe('@mentions', () => {
  it('finds the @name being typed', () => {
    expect(mentionAt('hey @Al', 7)).toEqual({ start: 4, query: 'Al' })
    expect(mentionAt('@', 1)).toEqual({ start: 0, query: '' })
    expect(mentionAt('mail@example', 12)).toBeNull()
  })

  it('ranks names starting with the query first, then containing it, at most 8', () => {
    expect(matchMentions(names, 'al')).toEqual(['Alice', 'Alfred', 'ALBERT', 'al', 'malice', 'xal1', 'yal2', 'zal3'])
    expect(matchMentions(names, '')).toEqual(names.slice(0, 8))
  })

  it('the phones’ in-page copy matches the same way', () => {
    for (const q of ['', 'a', 'al', 'AL', 'bob', 'zzz', '_9']) expect(inPage(names, q)).toEqual(matchMentions(names, q))
  })

  it('the in-page helper is valid JavaScript', () => {
    expect(() => new Function(mentionHelperScript({ dark: true, accent: '#7c5cff' }))).not.toThrow()
  })

  // The page scripts are template strings, where a lone \s turns into "s": names with an "s" in
  // them were left out, and the phones' helper never saw an @name being typed.
  it('keeps the regular expressions in the page scripts intact', () => {
    expect(CHATTER_NAMES).toContain('/\\s/.test(name)')
    const helper = mentionHelperScript({ dark: false, accent: '#000' })
    expect(helper).toContain('/(?:^|\\s)@([\\w.-]*)$/')
    expect(helper).toContain('replace(/^\\s+/')
    const findAt = new Function('t', `return ${helper.match(/\/\(\?:\^\|\\s\)@\(\[\\w\.-\]\*\)\$\//)![0]}.exec(t)`) as (t: string) => RegExpExecArray | null
    expect(findAt('hey @stat')?.[1]).toBe('stat')
    expect(findAt('mail@x')).toBeNull()
  })
})
