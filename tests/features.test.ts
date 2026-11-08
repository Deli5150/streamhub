import { describe, expect, it } from 'vitest'
import type { Channel, CombinedGroup, LiveInfo } from '@shared/types'
import { buildLiveRows, combinedEdits, nameMatches } from '../src/renderer/src/lib/combined'
import { formatAccelerator } from '../src/renderer/src/lib/shortcuts'

const ch = (key: string, name = key): Channel => {
  const [platform, id] = key.split(':') as [Channel['platform'], string]
  return { key, platform, id, displayName: name }
}
const lv = (key: string, viewers: number): LiveInfo => ({ key, title: `${key} stream`, viewers })

describe('combined channels', () => {
  const all = [ch('twitch:xqc', 'xQc'), ch('kick:xqc', 'xQc'), ch('youtube:UCx', 'xQc YT'), ch('twitch:other')]
  const group: CombinedGroup = { id: 'g1', mainKey: 'twitch:xqc', defaultKey: 'kick:xqc', memberKeys: ['twitch:xqc', 'kick:xqc', 'youtube:UCx'] }

  it('collapses live members into one row with summed viewers', () => {
    const live = { 'twitch:xqc': lv('twitch:xqc', 30000), 'kick:xqc': lv('kick:xqc', 10000), 'twitch:other': lv('twitch:other', 5) }
    const rows = buildLiveRows([all[0], all[1], all[3]], all, live, [group])
    expect(rows).toHaveLength(2)
    const g = rows[0]
    expect(g.kind).toBe('group')
    if (g.kind !== 'group') return
    expect(g.display.key).toBe('twitch:xqc') // main member is live → shown
    expect(g.playChannel.key).toBe('kick:xqc') // default member is live → plays
    expect(g.live.viewers).toBe(40000)
    expect(g.platforms).toEqual(['twitch', 'kick', 'youtube'])
    expect(rows[1]).toMatchObject({ kind: 'single', key: 'twitch:other' })
  })

  it('falls back to a live member when main/default are offline', () => {
    const live = { 'youtube:UCx': lv('youtube:UCx', 7) }
    const [row] = buildLiveRows([all[2]], all, live, [group])
    expect(row.kind === 'group' && [row.display.key, row.playChannel.key, row.live.viewers]).toEqual(['youtube:UCx', 'youtube:UCx', 7])
  })

  it('keeps each channel in at most one group', () => {
    const next = combinedEdits.create([group], ['kick:xqc', 'twitch:other'], 'kick:xqc', 'kick:xqc')
    expect(next[0].memberKeys).toEqual(['twitch:xqc', 'youtube:UCx'])
    expect(next[1].memberKeys).toEqual(['kick:xqc', 'twitch:other'])
    expect(combinedEdits.removeMember(next, 'g1', 'youtube:UCx')[0].memberKeys).toEqual(['twitch:xqc'])
    expect(combinedEdits.remove(next, 'g1')).toHaveLength(1)
  })
})

describe('shortcuts', () => {
  it('formats accelerators in macOS modifier order', () => {
    expect(formatAccelerator('Command+Control+S')).toBe('⌃⌘S')
    expect(formatAccelerator('Control+Command+Shift+M')).toBe('⌃⇧⌘M')
  })
})

describe('combine search', () => {
  const named = (displayName: string) => ({ displayName, platform: 'kick' as const })
  it('finds the same streamer under a shorter or longer name', () => {
    expect(nameMatches('xQcOW', named('xqc'))).toBe(true)
    expect(nameMatches('xqc', named('xQcOW'))).toBe(true)
    expect(nameMatches('Ludwig Ahgren', named('ludwig'))).toBe(true)
    expect(nameMatches('Hasan_Abi', named('HasanAbi'))).toBe(true)
  })
  it('ignores unrelated and too-short names', () => {
    expect(nameMatches('xQcOW', named('pokimane'))).toBe(false)
    expect(nameMatches('xQcOW', named('x'))).toBe(false)
    expect(nameMatches('kick', named('anyone'))).toBe(true)
    expect(nameMatches('', named('anyone'))).toBe(true)
  })
})
