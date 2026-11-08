import { useMemo, useState } from 'react'
import { LayersIcon, Link2Icon, RadioIcon } from 'lucide-react'
import type { Platform } from '@shared/types'
import { buildLiveRows, groupOf } from '../lib/combined'
import { useUi } from '../store'
import { ChannelRow } from './ChannelRow'
import { useChannelMenu } from './channelMenu'
import { LiveChannelCard } from './LiveChannelCard'
import { PLATFORM_META, PLATFORM_ORDER } from './platform'
import { SearchInput } from './ui'

/** Live grid on the left, every followed channel grouped by platform on the right. */
export function ChannelsPage(): React.JSX.Element {
  const { app, go } = useUi()
  const menu = useChannelMenu()
  const channels = app?.channels ?? []
  const live = channels
    .filter((c) => app?.live[c.key])
    .sort((a, b) => (app!.live[b.key].viewers ?? 0) - (app!.live[a.key].viewers ?? 0))
  const rows = app ? buildLiveRows(live, channels, app.live, app.settings.combined) : []

  return (
    <div className="flex h-full">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-baseline gap-2 px-0.5">
            <h2 className="text-large font-semibold text-primary">Live channels</h2>
            <span className="text-small text-tertiary tabular-nums">{rows.length}</span>
          </div>
          {rows.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center text-tertiary">
              <RadioIcon className="size-9 text-quaternary" strokeWidth={1.5} />
              <p className="max-w-sm text-regular">None of the channels you follow are live right now.</p>
            </div>
          ) : (
            <div className="grid [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))] gap-x-4 gap-y-5">
              {rows.map((r) => {
                const c = r.kind === 'group' ? r.display : r.channel
                const play = r.kind === 'group' ? r.playChannel : r.channel
                return (
                  <LiveChannelCard
                    key={r.key}
                    channel={c}
                    live={r.live}
                    combinedPlatforms={r.kind === 'group' ? r.platforms : undefined}
                    onSelect={() => go({ kind: 'watch', key: play.key })}
                    onOpenChannel={() => go({ kind: 'watch', key: play.key, offline: true })}
                    onContextMenu={(e) => menu.openFor(e, c)}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex w-[360px] shrink-0 flex-col border-l border-separator bg-popover">
        <div className="flex shrink-0 items-baseline gap-2 px-4 pt-3 pb-1">
          <h2 className="text-large font-semibold text-primary">Channels</h2>
          <span className="text-small text-tertiary tabular-nums">{channels.length}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          <FollowedChannelsPanel onOpenMenu={menu.openFor} />
        </div>
      </div>
      {menu.element}
    </div>
  )
}

function FollowedChannelsPanel({ onOpenMenu }: { onOpenMenu: ReturnType<typeof useChannelMenu>['openFor'] }): React.JSX.Element {
  const { app, go } = useUi()
  const [filter, setFilter] = useState<'all' | Platform>('all')
  const [query, setQuery] = useState('')
  const channels = app?.channels ?? []

  const grouped = useMemo(() => {
    const byPlatform = Object.fromEntries(PLATFORM_ORDER.map((p) => [p, channels.filter((c) => c.platform === p)])) as Record<
      Platform,
      typeof channels
    >
    for (const p of PLATFORM_ORDER) {
      byPlatform[p].sort((a, b) => {
        const la = Boolean(app?.live[a.key])
        const lb = Boolean(app?.live[b.key])
        return la !== lb ? (la ? -1 : 1) : a.displayName.localeCompare(b.displayName)
      })
    }
    return byPlatform
  }, [channels, app])

  if (channels.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-regular text-tertiary">No followed channels yet. Connect an account to see them here.</p>
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const matches = (name: string): boolean => !q || name.toLowerCase().includes(q)
  const pill = (active: boolean, activeBg: string): string =>
    `flex h-8 min-w-[52px] flex-1 shrink-0 items-center justify-center gap-1.5 rounded-md text-small-strong transition-colors disabled:opacity-40 ${
      active ? (activeBg ? `${activeBg} text-white` : 'bg-control text-primary ring-1 ring-secondary') : 'bg-control-subtle text-primary hover:bg-control'
    }`

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="sticky top-0 z-10 flex flex-col gap-1.5 bg-popover pt-1 pb-2">
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
          <button className={pill(filter === 'all', '')} onClick={() => setFilter('all')} title={`All platforms (${channels.length})`}>
            <LayersIcon className="size-4 shrink-0 text-primary" strokeWidth={2.5} />
            <span className="text-small text-secondary tabular-nums">{channels.length}</span>
          </button>
          {PLATFORM_ORDER.map((p) => {
            const meta = PLATFORM_META[p]
            const active = filter === p
            return (
              <button
                key={p}
                className={pill(active, meta.activeBg)}
                onClick={() => setFilter(p)}
                disabled={grouped[p].length === 0}
                title={`${meta.label} (${grouped[p].length})`}
              >
                <meta.Icon className={`${meta.iconClass} shrink-0 ${active ? 'text-white' : 'text-primary'}`} strokeWidth={2.5} />
                <span className={`text-small tabular-nums ${active ? 'text-white' : 'text-secondary'}`}>{grouped[p].length}</span>
              </button>
            )
          })}
        </div>
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search channels…" />
      </div>

      {PLATFORM_ORDER.map((p) => {
        if (filter !== 'all' && filter !== p) return null
        const list = grouped[p].filter((c) => matches(c.displayName))
        if (list.length === 0) return null
        const meta = PLATFORM_META[p]
        const liveCount = list.filter((c) => app?.live[c.key]).length
        return (
          <section key={p} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <meta.Icon className={`size-4 shrink-0 ${meta.accent}`} strokeWidth={2.5} />
              <span className="text-strong font-semibold text-primary">{meta.label}</span>
              <span className="text-small text-tertiary tabular-nums">
                {list.length} {list.length === 1 ? 'channel' : 'channels'}
                {liveCount > 0 ? ` · ${liveCount} live` : ''}
              </span>
            </div>
            <ul className="flex flex-col">
              {list.map((c) => (
                <li key={c.key}>
                  <button
                    onClick={() => go({ kind: 'watch', key: c.key })}
                    onContextMenu={(e) => onOpenMenu(e, c)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-control-subtle"
                  >
                    <span className="min-w-0 flex-1">
                      <ChannelRow channel={c} live={app?.live[c.key]} compact />
                    </span>
                    {groupOf(app?.settings.combined ?? [], c.key) && (
                      <Link2Icon className="size-3.5 shrink-0 text-tertiary" aria-label="Combined channel" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {q && PLATFORM_ORDER.every((p) => (filter !== 'all' && filter !== p) || !grouped[p].some((c) => matches(c.displayName))) && (
        <div className="py-10 text-center">
          <p className="text-regular text-tertiary">No channels match “{query.trim()}”.</p>
        </div>
      )}
    </div>
  )
}
