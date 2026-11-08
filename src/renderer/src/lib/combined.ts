import type { Channel, CombinedGroup, LiveInfo, Platform } from '@shared/types'

/** A live entry to render: a standalone channel, or a combined group collapsed into one row. */
export type DisplayRow =
  | { kind: 'single'; key: string; channel: Channel; live: LiveInfo }
  | {
      kind: 'group'
      key: string
      group: CombinedGroup
      /** Channel whose avatar/name is shown: the main member if live, else a live member. */
      display: Channel
      /** Channel opened on click: the default member if live, else a live member. */
      playChannel: Channel
      /** Live info of `playChannel`, with the viewer count summed across live members. */
      live: LiveInfo
      platforms: Platform[]
    }

export const groupOf = (groups: CombinedGroup[], key: string): CombinedGroup | undefined => groups.find((g) => g.memberKeys.includes(key))

/**
 * Collapses an ordered list of live channels into rows: the first live member of a group yields the
 * group's row and later members are skipped; standalone channels pass through.
 */
export function buildLiveRows(liveChannels: Channel[], all: Channel[], live: Record<string, LiveInfo>, groups: CombinedGroup[]): DisplayRow[] {
  const byKey = new Map(all.map((c) => [c.key, c]))
  const rows: DisplayRow[] = []
  const seen = new Set<string>()
  for (const channel of liveChannels) {
    const group = groupOf(groups, channel.key)
    if (!group) {
      rows.push({ kind: 'single', key: channel.key, channel, live: live[channel.key] })
      continue
    }
    if (seen.has(group.id)) continue
    seen.add(group.id)
    const liveMembers = group.memberKeys.map((k) => byKey.get(k)).filter((c): c is Channel => Boolean(c && live[c.key]))
    const main = byKey.get(group.mainKey)
    const def = byKey.get(group.defaultKey)
    const display = main && live[main.key] ? main : (liveMembers[0] ?? main ?? channel)
    const playChannel = def && live[def.key] ? def : (liveMembers[0] ?? display)
    rows.push({
      kind: 'group',
      key: group.id,
      group,
      display,
      playChannel,
      live: { ...live[playChannel.key], viewers: liveMembers.reduce((sum, c) => sum + (live[c.key]?.viewers ?? 0), 0) },
      platforms: group.memberKeys.map((k) => k.split(':')[0] as Platform)
    })
  }
  return rows
}

/** Pure group edits mirroring the Glaze app's combined-channels store. */
export const combinedEdits = {
  create(groups: CombinedGroup[], memberKeys: string[], mainKey: string, defaultKey: string): CombinedGroup[] {
    // A channel can only belong to one group: pull new members out of any existing group.
    const others = groups.map((g) => ({ ...g, memberKeys: g.memberKeys.filter((k) => !memberKeys.includes(k)) }))
    return [...others, { id: crypto.randomUUID(), memberKeys, mainKey, defaultKey }]
  },
  update(groups: CombinedGroup[], id: string, memberKeys: string[], mainKey: string, defaultKey: string): CombinedGroup[] {
    const others = groups
      .filter((g) => g.id !== id)
      .map((g) => ({ ...g, memberKeys: g.memberKeys.filter((k) => !memberKeys.includes(k)) }))
    return [...others, { id, memberKeys, mainKey, defaultKey }]
  },
  removeMember(groups: CombinedGroup[], id: string, key: string): CombinedGroup[] {
    return groups.map((g) => (g.id === id ? { ...g, memberKeys: g.memberKeys.filter((k) => k !== key) } : g))
  },
  remove(groups: CombinedGroup[], id: string): CombinedGroup[] {
    return groups.filter((g) => g.id !== id)
  }
}

const normalizeName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Combine search: whether a channel matches the query, tolerant of how a streamer's name differs
 * across platforms ("xQcOW" finds "xqc" and the other way round, "Ludwig Ahgren" finds "ludwig").
 * Also matches platform names ("kick").
 */
export function nameMatches(query: string, channel: Pick<Channel, 'displayName' | 'platform'>): boolean {
  const q = normalizeName(query)
  if (!q) return true
  if (channel.platform.includes(q)) return true
  const words = query.toLowerCase().split(/\s+/).map(normalizeName).filter(Boolean)
  const name = normalizeName(channel.displayName)
  const contained = (a: string, b: string): boolean => a.length >= 3 && b.includes(a)
  return name.includes(q) || contained(name, q) || words.some((w) => contained(w, name))
}
