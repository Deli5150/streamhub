import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowDownWideNarrowIcon, ArrowUpNarrowWideIcon, LayersIcon, RadioIcon, SearchIcon } from 'lucide-react'
import type { AppState, Channel, Platform } from '@shared/types'
import { buildLiveRows, type DisplayRow } from '../lib/combined'
import { applyColorway } from '../lib/theme'
import { applySystemAppearance, formatViewers } from '../store'
import { ChannelAvatar } from './ChannelAvatar'
import { CombinedPlatformDots, PLATFORM_META, PLATFORM_ORDER, PlatformOverlayBadge } from './platform'
import { Thumbnail } from './Thumbnail'

/** Root of the menu-bar popup window (loaded with ?view=menubar). */
export function MenubarPopup(): React.JSX.Element {
  const [app, setApp] = useState<AppState | null>(null)
  const [filter, setFilter] = useState<'all' | Platform>('all')
  const [search, setSearch] = useState('')
  const [sortDesc, setSortDesc] = useState(true)
  const theme = app?.settings.menubar.theme ?? 'default'

  useEffect(() => {
    // Transparent window: let the rounded panel define the shape.
    document.body.style.background = 'transparent'
    applySystemAppearance()
    window.api.getState().then(setApp)
    const off = window.api.onState(setApp)
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') window.api.hideMenubar()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Every popup style follows the app's theme.
  const colorway = app?.settings.theme ?? 'default'
  useEffect(() => applyColorway(colorway), [colorway])

  const { rows, counts } = useMemo(() => {
    if (!app) return { rows: [] as DisplayRow[], counts: {} as Record<string, number> }
    const live = app.channels.filter((c) => app.live[c.key])
    const counts = Object.fromEntries(PLATFORM_ORDER.map((p) => [p, live.filter((c) => c.platform === p).length]))
    const q = search.trim().toLowerCase()
    const visible = live
      .filter((c) => (filter === 'all' || c.platform === filter) && (!q || c.displayName.toLowerCase().includes(q)))
      .sort((a, b) => ((app.live[b.key].viewers ?? 0) - (app.live[a.key].viewers ?? 0)) * (sortDesc ? 1 : -1))
    return { rows: buildLiveRows(visible, app.channels, app.live, app.settings.combined), counts }
  }, [app, filter, search, sortDesc])

  const pick = (r: DisplayRow): void => void window.api.pickFromMenubar(r.kind === 'group' ? r.playChannel.key : r.channel.key)

  if (!app) return <div className="h-full rounded-xl menubar-panel" />
  if (theme === 'terminal') return <Terminal rows={rows} onPick={pick} />
  if (theme === 'shortcuts') return <ShortcutsList rows={rows} onPick={pick} />

  const vertical = theme === 'gummy'
  const pills = (
    <>
      <FilterPill vertical={vertical} active={filter === 'all'} onClick={() => setFilter('all')} title={`All (${rows.length})`} activeBg="">
        <LayersIcon className="size-4 shrink-0" strokeWidth={2.5} />
      </FilterPill>
      {PLATFORM_ORDER.map((p) => {
        const meta = PLATFORM_META[p]
        return (
          <FilterPill key={p} vertical={vertical} active={filter === p} onClick={() => setFilter(p)} title={`${meta.label} (${counts[p] ?? 0})`} activeBg={meta.activeBg} disabled={!counts[p]}>
            <meta.Icon className={`${meta.iconClass} shrink-0`} strokeWidth={2.5} />
          </FilterPill>
        )
      })}
    </>
  )
  const empty = (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-6 py-12 text-center">
      <p className="text-regular text-tertiary">No live channels</p>
      <p className="text-small text-tertiary">
        {search.trim() ? 'No channels match your search.' : filter === 'all' ? 'None of your followed channels are streaming right now.' : `No ${PLATFORM_META[filter].label} channels live.`}
      </p>
    </div>
  )

  if (theme === 'gummy') {
    return (
      <div className="flex h-full overflow-hidden menubar-panel rounded-2xl shadow-2xl ring-1 ring-separator">
        <div className="flex w-14 shrink-0 flex-col items-center gap-1.5 border-r border-separator py-3">{pills}</div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
            <label className="flex h-8 flex-1 items-center gap-1.5 rounded-md bg-control-subtle px-2.5">
              <SearchIcon className="size-3.5 text-tertiary" />
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent text-regular text-primary outline-none placeholder:text-tertiary" />
            </label>
          </div>
          <div className="flex shrink-0 items-center justify-between border-b border-separator px-3 py-1.5">
            <span className="text-small text-tertiary">
              Live now <span className="tabular-nums">{rows.length}</span>
            </span>
            <button onClick={() => setSortDesc((d) => !d)} className="flex items-center gap-1 text-small-strong text-secondary hover:text-primary" title={sortDesc ? 'Viewers: high to low' : 'Viewers: low to high'}>
              Viewers
              {sortDesc ? <ArrowDownWideNarrowIcon className="size-3.5" /> : <ArrowUpNarrowWideIcon className="size-3.5" />}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {rows.length === 0
              ? empty
              : rows.map((r) => {
                  const c = getChannel(r)
                  return (
                    <button key={r.key} onClick={() => pick(r)} className="flex w-full items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-control-subtle">
                      <div className="relative aspect-video w-[108px] shrink-0 overflow-hidden rounded-md bg-control ring-1 ring-separator">
                        <Thumbnail src={r.live.thumbnail} />
                        <span className="absolute bottom-1 left-1 rounded bg-support-red px-1.5 py-0.5 text-[10px] leading-none font-bold tracking-wide text-white uppercase shadow-sm">Live</span>
                        <span className="absolute right-1 bottom-1">
                          <CombinedPlatformDots platforms={r.kind === 'group' ? r.platforms : [c.platform]} className="relative" />
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-strong text-primary">{c.displayName}</span>
                          {r.live.viewers !== undefined && (
                            <span className="flex shrink-0 items-center gap-1 text-small-strong text-support-red tabular-nums">
                              {r.live.viewers.toLocaleString('en-US')}
                              <RadioIcon className="size-3" strokeWidth={2.5} />
                            </span>
                          )}
                        </div>
                        {r.live.title && <span className="line-clamp-2 text-small leading-snug text-secondary">{r.live.title}</span>}
                        {r.live.category && <span className="truncate text-small text-tertiary">{r.live.category}</span>}
                      </div>
                    </button>
                  )
                })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden menubar-panel rounded-xl shadow-2xl ring-1 ring-separator">
      <div className="flex shrink-0 items-center justify-between border-b border-separator px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-strong font-semibold text-primary">Live now</span>
          <span className="text-small text-tertiary tabular-nums">{rows.length}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 border-b border-separator px-3 py-2">{pills}</div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          empty
        ) : theme === 'operagx' ? (
          <div className="grid grid-cols-4 gap-3 p-3">
            {rows.map((r) => {
              const c = getChannel(r)
              return (
                <button key={r.key} onClick={() => pick(r)} title={r.live.category ? `${c.displayName} — ${r.live.category}` : c.displayName} className="group relative aspect-square w-full">
                  <ChannelAvatar src={c.avatarUrl} name={c.displayName} className="size-full rounded-xl bg-control object-cover ring-1 ring-separator transition-shadow group-hover:ring-2 group-hover:ring-accent" />
                  <span className="absolute top-1 left-1">
                    <CombinedPlatformDots platforms={r.kind === 'group' ? r.platforms : [c.platform]} className="relative" />
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <ul className="flex flex-col py-1">
            {rows.map((r) => {
              const c = getChannel(r)
              return (
                <li key={r.key}>
                  <button onClick={() => pick(r)} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-control-subtle active:bg-control">
                    <div className="relative shrink-0">
                      <ChannelAvatar src={c.avatarUrl} name={c.displayName} className="size-10 rounded-full bg-control object-cover" />
                      <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-support-red ring-2 ring-background" />
                      {r.kind === 'group' ? <CombinedPlatformDots platforms={r.platforms} /> : <PlatformOverlayBadge platform={c.platform} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="truncate text-strong text-primary">{c.displayName}</span>
                        {r.live.viewers !== undefined && <span className="shrink-0 text-small text-tertiary tabular-nums">{formatViewers(r.live.viewers)} viewers</span>}
                      </div>
                      {(r.live.category || r.live.title) && <div className="truncate text-small text-tertiary">{r.live.category || r.live.title}</div>}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

/** The channel a row shows: a combined group's display member, or the channel itself. */
const getChannel = (r: DisplayRow): Channel => (r.kind === 'group' ? r.display : r.channel)

function FilterPill({
  active,
  onClick,
  activeBg,
  title,
  disabled,
  vertical,
  children
}: {
  /** Square pills stacked in the Gummy sidebar, instead of a stretching horizontal strip. */
  vertical?: boolean
  active: boolean
  onClick(): void
  activeBg: string
  title: string
  disabled?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      className={`flex items-center justify-center transition-colors disabled:opacity-35 ${vertical ? 'size-10 rounded-xl' : 'h-8 w-full min-w-10 flex-1 rounded-md'} ${
        active ? (activeBg ? `${activeBg} text-white` : 'bg-control text-primary ring-1 ring-secondary') : 'bg-control-subtle text-primary hover:bg-control'
      }`}
    >
      {children}
    </button>
  )
}

/** iOS Shortcuts-style "choose from list" sheet, names only. */
function ShortcutsList({ rows, onPick }: { rows: DisplayRow[]; onPick(r: DisplayRow): void }): React.JSX.Element {
  return (
    <div className="flex h-full flex-col overflow-hidden menubar-panel rounded-2xl shadow-2xl ring-1 ring-separator">
      <div className="shrink-0 px-5 pt-4 pb-3">
        <h1 className="text-[25px] leading-tight font-semibold tracking-tight text-primary">Select a streamer to watch</h1>
      </div>
      <div className="mx-4 mb-4 min-h-0 flex-1 overflow-hidden rounded-xl bg-control-subtle ring-1 ring-separator">
        {rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-5 py-12 text-center">
            <p className="text-regular text-secondary">No live channels</p>
            <p className="text-small text-tertiary">None of your followed channels are streaming right now.</p>
          </div>
        ) : (
          <ul className="no-scrollbar flex h-full flex-col overflow-y-auto px-4">
            {rows.map((r, i) => (
              <li key={r.key}>
                <button
                  onClick={() => onPick(r)}
                  className={`w-full truncate py-4 text-left text-[20px] font-normal tracking-tight text-primary transition-colors hover:text-secondary ${i > 0 ? 'border-t border-separator' : ''}`}
                >
                  {getChannel(r).displayName}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

type Line = { text: string; tone: 'default' | 'muted' | 'accent' | 'error' }
const TONE: Record<Line['tone'], string> = { default: 'text-primary', muted: 'text-tertiary', accent: 'text-accent', error: 'text-support-red' }
const COMMANDS = [
  { cmd: '/help', desc: 'Show all commands' },
  { cmd: '/live', desc: 'List live channels · /live <name> opens one' },
  { cmd: '/clear', desc: 'Clear the terminal' }
]
const GREETING: Line[] = [
  { text: 'StreamHub Terminal', tone: 'accent' },
  { text: 'Type /help to see commands.', tone: 'muted' }
]

/** Terminal style: a command line for jumping to live channels. */
function Terminal({ rows, onPick }: { rows: DisplayRow[]; onPick(r: DisplayRow): void }): React.JSX.Element {
  const [lines, setLines] = useState<Line[]>(GREETING)
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  // Block body: Chromium's scrollIntoView now returns a promise, which React would take for a cleanup.
  useEffect(() => {
    endRef.current?.scrollIntoView()
  }, [lines])

  const print = (...out: Line[]): void => setLines((l) => [...l, ...out])
  const run = (raw: string): void => {
    const [cmd, ...rest] = raw.trim().split(/\s+/)
    const arg = rest.join(' ').toLowerCase()
    print({ text: `$ ${raw}`, tone: 'muted' })
    if (cmd === '/clear') return setLines([])
    if (cmd === '/help') return print(...COMMANDS.map((c) => ({ text: `${c.cmd.padEnd(8)} ${c.desc}`, tone: 'default' as const })))
    if (cmd === '/live') {
      if (!arg) {
        if (!rows.length) return print({ text: 'Nobody you follow is live.', tone: 'muted' })
        return print(
          ...rows.map((r) => ({
            text: `● ${getChannel(r).displayName.padEnd(18)} ${formatViewers(r.live.viewers).padStart(6)}  ${r.kind === 'group' ? r.platforms.join('+') : getChannel(r).platform}`,
            tone: 'default' as const
          }))
        )
      }
      const match = rows.find((r) => getChannel(r).displayName.toLowerCase().includes(arg))
      if (!match) return print({ text: `No live channel matches "${arg}".`, tone: 'error' })
      print({ text: `Opening ${getChannel(match).displayName}…`, tone: 'accent' })
      return onPick(match)
    }
    print({ text: `Unknown command: ${cmd}. Type /help.`, tone: 'error' })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden menubar-panel rounded-xl font-mono text-[12px] leading-[18px] shadow-2xl ring-1 ring-separator" onClick={() => document.getElementById('term-input')?.focus()}>
      <div className="flex shrink-0 items-center gap-1.5 border-b border-separator px-3 py-2">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 text-tertiary">streamhub — {rows.length} live</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 whitespace-pre-wrap select-text">
        {lines.map((l, i) => (
          <div key={i} className={TONE[l.tone]}>
            {l.text}
          </div>
        ))}
        <div className="flex items-center gap-2 text-primary">
          <span className="text-accent">❯</span>
          <input
            id="term-input"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter' && input.trim()) {
                run(input)
                setInput('')
              }
            }}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent caret-accent outline-none"
          />
        </div>
        <div ref={endRef} />
      </div>
    </div>
  )
}
