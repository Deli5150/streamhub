import { useEffect, useMemo, useState } from 'react'
import { LayersIcon, Link2Icon, UsersIcon, XIcon } from 'lucide-react'
import type { Platform } from '@shared/types'
import { groupOf } from '../lib/combined'
import { useUi } from '../store'
import { ChannelRow } from './ChannelRow'
import { useChannelMenu } from './channelMenu'
import { PLATFORM_META, PLATFORM_ORDER } from './platform'
import { SearchInput } from './ui'

// Every followed channel, grouped by platform, with a search box: a panel that slides out from the
// right edge of Home (the handle there) and closes with Esc, a click outside or picking a channel.

/** The handle on the right edge of Home that slides the channels panel out. */
export function ChannelsHandle(): React.JSX.Element | null {
  const count = useUi((s) => s.app?.channels.length ?? 0)
  const open = useUi((s) => s.channelsOpen)
  if (open) return null
  return (
    <button
      type="button"
      onClick={() => useUi.getState().set({ channelsOpen: true })}
      title="All your channels: search and browse"
      className="absolute top-1/2 right-0 z-30 flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-xl bg-popover py-3 pr-1.5 pl-2 text-secondary shadow-lg ring-1 ring-separator transition-colors hover:text-primary"
    >
      <UsersIcon className="size-4" strokeWidth={2.25} />
      <span className="text-small-strong tabular-nums">{count}</span>
      <span className="text-small-strong [writing-mode:vertical-rl]">Channels</span>
    </button>
  )
}

/** The slide-out panel itself (App.tsx), over whatever's showing. */
export function ChannelsDrawer(): React.JSX.Element {
  const open = useUi((s) => s.channelsOpen)
  const count = useUi((s) => s.app?.channels.length ?? 0)
  const menu = useChannelMenu()
  const close = (): void => useUi.getState().set({ channelsOpen: false })
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <div
        onClick={close}
        className={`fixed inset-x-0 top-11 bottom-0 z-40 bg-black/25 transition-opacity duration-200 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        aria-hidden={!open}
        className={`fixed top-11 right-0 bottom-0 z-40 flex w-[360px] max-w-[90vw] flex-col border-l border-separator bg-popover transition-[transform,box-shadow] duration-200 ease-out ${
          open ? 'translate-x-0 shadow-2xl' : 'pointer-events-none translate-x-full shadow-none'
        }`}
      >
        <div className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-1">
          <h2 className="text-large font-semibold text-primary">Channels</h2>
          <span className="text-small text-tertiary tabular-nums">{count}</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={close}
            title="Close (Esc)"
            className="flex size-7 items-center justify-center rounded-full transition-colors hover:bg-control"
          >
            <XIcon className="size-4 text-secondary" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3">{open && <FollowedChannelsPanel onOpenMenu={menu.openFor} onPicked={close} />}</div>
      </aside>
      {menu.element}
    </>
  )
}

function FollowedChannelsPanel({ onOpenMenu, onPicked }: { onOpenMenu: ReturnType<typeof useChannelMenu>['openFor']; onPicked(): void }): React.JSX.Element {
  const { app, go } = useUi()
  const [filter, setFilter] = useState<'all' | Platform>('all')
  const [query, setQuery] = useState('')
  const channels = app?.channels ?? []

  const grouped = useMemo(() => {
    const byPlatform = Object.fromEntries(PLATFORM_ORDER.map((p) => [p, channels.filter((c) => c.platform === p)])) as Record<Platform, typeof channels>
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
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search channels…" autoFocus />
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
                    onClick={() => {
                      go({ kind: 'watch', key: c.key })
                      onPicked()
                    }}
                    onContextMenu={(e) => onOpenMenu(e, c)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-control-subtle"
                  >
                    <span className="min-w-0 flex-1">
                      <ChannelRow channel={c} live={app?.live[c.key]} compact />
                    </span>
                    {groupOf(app?.settings.combined ?? [], c.key) && <Link2Icon className="size-3.5 shrink-0 text-tertiary" aria-label="Combined channel" />}
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
