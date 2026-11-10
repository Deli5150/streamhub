import { useMemo } from 'react'
import { PanelLeftCloseIcon, PanelLeftOpenIcon, TvIcon } from 'lucide-react'
import type { Platform } from '@shared/types'
import { buildLiveRows, type DisplayRow } from '../lib/combined'
import { useUi } from '../store'
import { ChannelAvatar } from './ChannelAvatar'
import { ChannelRow } from './ChannelRow'
import { useChannelMenu } from './channelMenu'
import { CombinedPlatformDots, PLATFORM_META, PLATFORM_ORDER, PlatformOverlayBadge } from './platform'
import { Button, EmptyState, SearchInput } from './ui'

/**
 * Live-only sidebar (every channel is in the Channels panel, ChannelsDrawer.tsx), with a platform filter grid and
 * a collapsed avatar rail — the layout of the Glaze StreamHub sidebar.
 */
export function Sidebar(): React.JSX.Element {
  const { app, collapsed, filter, search, view, set, go } = useUi()
  const menu = useChannelMenu()

  const { live, followed, liveCount } = useMemo(() => {
    const channels = app?.channels ?? []
    const live = channels
      .filter((c) => app?.live[c.key])
      .sort((a, b) => (app!.live[b.key].viewers ?? 0) - (app!.live[a.key].viewers ?? 0))
    const liveCount = Object.fromEntries(PLATFORM_ORDER.map((p) => [p, live.filter((c) => c.platform === p).length])) as Record<Platform, number>
    return { live, followed: new Set(channels.map((c) => c.platform)), liveCount }
  }, [app])

  const q = search.trim().toLowerCase()
  const filtered = live.filter((c) => (filter === 'all' || c.platform === filter) && (!q || c.displayName.toLowerCase().includes(q)))
  // Combined channels collapse into a single row (shown member, summed viewers).
  const rows = app ? buildLiveRows(filtered, app.channels, app.live, app.settings.combined) : []
  const selectedKey = view.kind === 'watch' ? view.key : null
  const rowChannel = (r: DisplayRow): typeof live[number] => (r.kind === 'group' ? r.display : r.channel)
  const rowPlay = (r: DisplayRow): typeof live[number] => (r.kind === 'group' ? r.playChannel : r.channel)
  const isSelected = (r: DisplayRow): boolean =>
    r.kind === 'group' ? Boolean(selectedKey && r.group.memberKeys.includes(selectedKey)) : r.key === selectedKey
  const allRows = app ? buildLiveRows(live, app.channels, app.live, app.settings.combined) : []

  if (collapsed) {
    return (
      <aside className="h-full w-[68px] shrink-0 p-2 pr-0">
        <div className="ui-sidebar no-scrollbar flex h-full flex-col items-center gap-2 overflow-y-auto rounded-panel bg-well pt-3 pb-3 ring-1 ring-separator">
          <button
            onClick={() => set({ collapsed: false })}
            title="Expand sidebar"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-control-subtle transition-colors hover:bg-control"
          >
            <PanelLeftOpenIcon className="size-4 shrink-0 text-primary" strokeWidth={2.25} />
          </button>
          <div className="my-1 h-px w-8 shrink-0 bg-control" />
          {allRows.map((r) => {
            const c = rowChannel(r)
            return (
              <button
                key={r.key}
                onClick={() => go({ kind: 'watch', key: rowPlay(r).key })}
                onContextMenu={(e) => menu.openFor(e, c)}
                title={`${c.displayName} — ${r.live.title}`}
                className={`relative shrink-0 rounded-full transition-all ${
                  isSelected(r) ? 'ring-2 ring-accent ring-offset-2 ring-offset-background' : 'hover:opacity-80'
                }`}
              >
                <ChannelAvatar src={c.avatarUrl} name={c.displayName} className="block size-9 rounded-full bg-control object-cover" />
                {r.kind === 'group' ? (
                  <CombinedPlatformDots platforms={r.platforms} className="absolute -bottom-0.5 -left-0.5" />
                ) : (
                  <PlatformOverlayBadge platform={c.platform} size="sm" />
                )}
                <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-support-red ring-2 ring-background" />
              </button>
            )
          })}
        </div>
        {menu.element}
      </aside>
    )
  }

  return (
    <aside className="h-full w-[264px] shrink-0 p-2 pr-0">
      <div className="ui-sidebar flex h-full flex-col overflow-hidden rounded-panel bg-well ring-1 ring-separator">
        <div className="flex flex-col gap-2 px-3 pt-3 pb-2">
          <div className="flex items-center gap-1.5">
            <div className="flex-1">
              <SearchInput value={search} onChange={(e) => set({ search: e.target.value })} placeholder="Search live channels" />
            </div>
            <button
              onClick={() => set({ collapsed: true })}
              title="Collapse sidebar"
              className="ui-icon-btn flex size-7 shrink-0 items-center justify-center rounded-md text-secondary transition-colors hover:bg-control-subtle hover:text-primary"
            >
              <PanelLeftCloseIcon className="size-4" strokeWidth={2.25} />
            </button>
          </div>
          {followed.size > 0 && (
            // One button per signed-in platform, sharing the row equally however many there are.
            <div className="flex gap-1.5">
              {PLATFORM_ORDER.filter((p) => followed.has(p)).map((p) => {
                const meta = PLATFORM_META[p]
                const active = filter === p
                return (
                  <button
                    key={p}
                    onClick={() => set({ filter: active ? 'all' : p })}
                    title={meta.label}
                    aria-pressed={active}
                    className={`flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md text-small-strong transition-colors ${
                      active ? `${meta.activeBg} text-white` : 'bg-control-subtle text-primary hover:bg-control'
                    }`}
                  >
                    <meta.Icon className={`${meta.iconClass} shrink-0 text-current`} strokeWidth={2.5} />
                    <span className="tabular-nums">{liveCount[p]}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {app && app.channels.length === 0 ? (
            <EmptyState
              icon={<TvIcon className="size-8 text-tertiary" />}
              title="No followed channels"
              description="Sign in to your accounts to see the channels you follow."
            >
              <Button variant="filled" onClick={() => go({ kind: 'accounts' })}>
                Open Accounts
              </Button>
            </EmptyState>
          ) : app && live.length === 0 ? (
            <EmptyState
              icon={<TvIcon className="size-8 text-tertiary" />}
              title="No one is live"
              description={'None of your followed channels are streaming right now. Open Channels on the right of Home to browse everyone you follow.'}
            />
          ) : q && rows.length === 0 ? (
            <EmptyState icon={<TvIcon className="size-8 text-tertiary" />} title="No matches" description={`No live channels match “${search.trim()}”.`} />
          ) : (
            <>
              {rows.length > 0 && (
                <div className="px-2 pt-2 pb-1">
                  <span className="text-small font-medium tracking-wider text-tertiary uppercase">Live — {rows.length}</span>
                </div>
              )}
              {rows.map((r) => {
                const c = rowChannel(r)
                return (
                  <button
                    key={r.key}
                    onClick={() => go({ kind: 'watch', key: rowPlay(r).key })}
                    onContextMenu={(e) => menu.openFor(e, c)}
                    title={[r.live.title, r.live.category].filter(Boolean).join(' · ') || c.displayName}
                    className={`flex w-full rounded-[10px] px-2 py-1.5 text-left transition-colors ${
                      isSelected(r) ? 'bg-list-selection' : 'hover:bg-list-hover'
                    }`}
                  >
                    <ChannelRow channel={c} live={r.live} combinedPlatforms={r.kind === 'group' ? r.platforms : undefined} />
                  </button>
                )
              })}
            </>
          )}
          {app?.accounts
            .filter((a) => a.error)
            .map((a) => (
              <div key={a.platform} className="px-2 py-2">
                <span className="text-small text-support-red">
                  {PLATFORM_META[a.platform].label}: {a.error}
                </span>
              </div>
            ))}
        </div>
      </div>
      {menu.element}
    </aside>
  )
}
