import { useEffect, useMemo, useRef, useState } from 'react'
import { BookmarkIcon, DeleteIcon, KeyboardIcon, ListVideoIcon, MoonIcon, SearchIcon, UsersIcon, XIcon } from 'lucide-react'
import { PLATFORMS, type AppState, type Channel, type Platform, type SavedItem } from '@shared/types'
import { buildLiveRows, groupOf, nameMatches, type DisplayRow } from '../../lib/combined'
import { focusEl, focusId, useBp, useBpInput, type BpTab } from '../../lib/bigPicture'
import { useQueue } from '../../lib/queue'
import { savedLive, savedTitle, useWatchLater } from '../../lib/watchLater'
import { progressFraction, progressKey, useVodProgress } from '../../lib/vodProgress'
import { formatViewers, uptime, useUi } from '../../store'
import { PLATFORM_META } from '../platform'
import { Thumbnail } from '../Thumbnail'
import { BpButton, ChannelTile, FOCUS, Hints, Row, VideoCard, type Hint } from './parts'

// Big Picture's home: the tab named by useBp().tab.

export function BpHome(): React.JSX.Element {
  const tab = useBp((s) => s.tab)
  return (
    <div key={tab} data-bp-scroller="" className="h-full overflow-y-auto pb-24 [scrollbar-width:none]">
      {tab === 'search' && <SearchTab />}
      {tab === 'live' && <LiveTab />}
      {tab === 'following' && <FollowingTab />}
      {tab === 'watchLater' && <ListTab source="watchLater" />}
      {tab === 'queue' && <ListTab source="queue" />}
    </div>
  )
}

/** The tabs, in order (Queue only while it has something in it). */
export function useTabs(): Array<{ id: BpTab; label: string }> {
  const queued = useQueue((s) => s.items.length)
  return [
    { id: 'live', label: 'Live' },
    { id: 'following', label: 'Following' },
    { id: 'watchLater', label: 'Watch Later' },
    ...(queued > 0 ? [{ id: 'queue' as const, label: 'Queue' }] : []),
    { id: 'search', label: 'Search' }
  ]
}

/** Extra controller hints for the current tab. */
export function tabHints(tab: BpTab): Hint[] {
  return []
}

function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }): React.JSX.Element {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="text-white/40">{icon}</span>
      <p className="text-[30px] font-bold text-white">{title}</p>
      <p className="max-w-xl text-[19px] text-white/60">{text}</p>
    </div>
  )
}

// ---------- Live ----------

const rowChannel = (r: DisplayRow): Channel => (r.kind === 'group' ? r.playChannel : r.channel)

/** A channel, or a combined channel shown once (its main member, with every member's platform). */
interface Tile {
  id: string
  channel: Channel
  members: Channel[]
  live: boolean
  viewers: number
}

/** Every followed channel as tiles, combined channels collapsed into one; live first, busiest first, then by name. */
function channelTiles(app: AppState): Tile[] {
  const byKey = new Map(app.channels.map((c) => [c.key, c]))
  const seen = new Set<string>()
  const tiles: Tile[] = []
  for (const c of app.channels) {
    if (seen.has(c.key)) continue
    const group = groupOf(app.settings.combined, c.key)
    const members = group ? group.memberKeys.map((k) => byKey.get(k)).filter((m): m is Channel => Boolean(m)) : [c]
    for (const m of members) seen.add(m.key)
    const live = members.filter((m) => app.live[m.key])
    tiles.push({
      id: group ? `group:${group.id}` : c.key,
      channel: (group && byKey.get(group.mainKey)) || members[0] || c,
      members,
      live: live.length > 0,
      viewers: live.reduce((n, m) => n + (app.live[m.key]?.viewers ?? 0), 0)
    })
  }
  return tiles.sort((a, b) => Number(b.live) - Number(a.live) || b.viewers - a.viewers || a.channel.displayName.localeCompare(b.channel.displayName))
}

const tilePlatforms = (t: Tile): Platform[] => [...new Set(t.members.map((m) => m.platform))]
/** Platforms a row is live on (a combined channel's members that are live). */
const livePlatforms = (r: DisplayRow, live: Record<string, unknown>): Platform[] =>
  r.kind === 'group' ? [...new Set(r.group.memberKeys.filter((k) => live[k]).map((k) => k.split(':')[0] as Platform))] : [r.channel.platform]
/** Viewer counts some platforms don't give (summed as 0) aren't shown. */
const viewersOf = (n?: number): number | undefined => (n ? n : undefined)

function LiveTab(): React.JSX.Element {
  const app = useUi((s) => s.app)
  const push = useBp((s) => s.push)
  const rows = useMemo(() => {
    if (!app) return []
    const live = app.channels.filter((c) => app.live[c.key]).sort((a, b) => (app.live[b.key].viewers ?? 0) - (app.live[a.key].viewers ?? 0))
    return buildLiveRows(live, app.channels, app.live, app.settings.combined)
  }, [app])
  const [heroKey, setHeroKey] = useState<string | null>(null)
  const hero = rows.find((r) => r.key === heroKey) ?? rows[0]
  if (!app) return <div />
  if (!rows.length) return <Empty icon={<MoonIcon className="size-16" strokeWidth={1.5} />} title="Nobody's live" text="Channels you follow show up here as soon as they go live." />

  const card = (r: DisplayRow, prefix: string): React.JSX.Element => {
    const ch = rowChannel(r)
    const display = r.kind === 'group' ? r.display : r.channel
    return (
      <VideoCard
        key={r.key}
        id={`${prefix}:${r.key}`}
        thumbnail={r.live.thumbnail}
        title={r.live.title || display.displayName}
        channel={{ name: display.displayName, avatarUrl: display.avatarUrl }}
        subtitle={r.live.category}
        platforms={livePlatforms(r, app.live)}
        live
        viewers={viewersOf(r.live.viewers)}
        onFocus={() => setHeroKey(r.key)}
        onPress={() => push({ kind: 'live', key: ch.key })}
        menu={{ item: savedLive(ch, app.live[ch.key]), title: r.live.title || display.displayName }}
        size={prefix === 'all' ? 'lg' : 'md'}
      />
    )
  }
  const byPlatform = PLATFORMS.map((p) => ({ p, list: rows.filter((r) => livePlatforms(r, app.live).includes(p)) })).filter((x) => x.list.length)
  const heroDisplay = hero.kind === 'group' ? hero.display : hero.channel

  return (
    <>
      {/* The focused stream, big. */}
      <div className="relative mb-6 h-[38vh] min-h-[280px] overflow-hidden">
        <div className="absolute inset-0 opacity-60">
          <Thumbnail src={hero.live.thumbnail} />
        </div>
        {/* Plain rgba gradients: Tailwind's (blended in oklab) come out washed out here. */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #0b0b10, rgba(11,11,16,0.75) 50%, rgba(11,11,16,0))' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #0b0b10, rgba(11,11,16,0) 50%)' }} />
        <div className="relative flex h-full max-w-[55%] flex-col justify-end px-16 pb-8">
          <span className="mb-3 w-fit rounded-md bg-[#e5242c] px-2.5 py-1 text-[15px] font-bold tracking-wide text-white">LIVE</span>
          <h1 className="text-[46px] leading-tight font-extrabold tracking-tight text-white">{heroDisplay.displayName}</h1>
          <p className="mt-2 line-clamp-2 text-[22px] leading-snug text-white/85">{hero.live.title}</p>
          <p className="mt-3 flex items-center gap-4 text-[18px] text-white/60">
            {hero.live.category && <span className="font-semibold text-white/80">{hero.live.category}</span>}
            {viewersOf(hero.live.viewers) !== undefined && <span>{formatViewers(hero.live.viewers)} watching</span>}
            {hero.live.startedAt && <span className="tabular-nums">{uptime(hero.live.startedAt)}</span>}
          </p>
        </div>
      </div>
      <Row title="Live now" count={rows.length}>
        {rows.map((r) => card(r, 'all'))}
      </Row>
      {byPlatform.length > 1 &&
        byPlatform.map(({ p, list }) => (
          <Row key={p} title={PLATFORM_META[p].label} count={list.length}>
            {list.map((r) => card(r, p))}
          </Row>
        ))}
    </>
  )
}

// ---------- Following ----------

function FollowingTab(): React.JSX.Element {
  const app = useUi((s) => s.app)
  const tiles = useMemo(() => (app ? channelTiles(app) : []), [app])
  if (!tiles.length) return <Empty icon={<UsersIcon className="size-16" strokeWidth={1.5} />} title="No channels yet" text="Leave Big Picture and sign in to your platforms under Accounts to see the channels you follow." />
  return <TileGrid tiles={tiles} />
}

function TileGrid({ tiles }: { tiles: Tile[] }): React.JSX.Element {
  const push = useBp((s) => s.push)
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4 px-14 pt-6">
      {tiles.map((t) => (
        <ChannelTile key={t.id} id={t.id} channel={t.channel} platforms={tilePlatforms(t)} live={t.live} onPress={() => push({ kind: 'channel', key: t.channel.key })} />
      ))}
    </div>
  )
}

// ---------- Search ----------

/** Kept while Big Picture is open, so coming back from a result shows the same search. */
let lastQuery = ''

const OSK_ROWS = ['1234567890', 'qwertyuiop', "asdfghjkl'", 'zxcvbnm-_.']

/**
 * Search followed channels (by name, across platforms) and live streams (by title or game). Type
 * with a keyboard straight into the box, or open the on-screen keyboard with the button next to it
 * (or A on the box) to type with the controller: X deletes, Y adds a space, B closes it.
 */
function SearchTab(): React.JSX.Element {
  const app = useUi((s) => s.app)
  const push = useBp((s) => s.push)
  const [query, setQueryState] = useState(lastQuery)
  const setQuery = (q: string): void => {
    lastQuery = q
    setQueryState(q)
  }
  const [osk, setOsk] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const q = query.trim().toLowerCase()

  const tiles = useMemo(() => (app ? channelTiles(app) : []), [app])
  const channels = q ? tiles.filter((t) => t.members.some((m) => nameMatches(q, m))) : []
  const liveRows = useMemo(() => {
    if (!app || !q) return []
    const live = app.channels.filter((c) => app.live[c.key]).sort((a, b) => (app.live[b.key].viewers ?? 0) - (app.live[a.key].viewers ?? 0))
    const matches = (c: Channel): boolean => {
      const l = app.live[c.key]
      return nameMatches(q, c) || (l.title ?? '').toLowerCase().includes(q) || (l.category ?? '').toLowerCase().includes(q)
    }
    return buildLiveRows(live.filter(matches), app.channels, app.live, app.settings.combined)
  }, [app, q])

  // Start in the box (or on the keyboard toggle when coming back to the tab with a controller).
  useEffect(() => {
    requestAnimationFrame(() => {
      if (!document.activeElement?.closest('main')) focusEl(inputRef.current)
    })
  }, [])

  const firstResult = (): void => focusEl(document.querySelector<HTMLElement>('[data-bp-results] [data-bp]'))
  const type = (text: string): void => setQuery(query + text)
  const backspace = (): void => setQuery(query.slice(0, -1))
  const closeOsk = (): void => {
    setOsk(false)
    requestAnimationFrame(() => focusId('osk-toggle'))
  }

  useBpInput((action, source) => {
    const inBox = document.activeElement === inputRef.current
    // X and Y type only on the keyboard itself (Y on a result opens its menu).
    const onKeyboard = Boolean(document.activeElement?.closest('[data-bp-osk]'))
    if (osk && (((action === 'x' || action === 'y') && onKeyboard) || action === 'back')) {
      if (action === 'x') backspace()
      else if (action === 'y') type(' ')
      else closeOsk()
      return true
    }
    // A on the box: a controller opens the on-screen keyboard; Enter goes to the results.
    if (inBox && action === 'select') {
      if (source === 'pad') {
        setOsk(true)
        requestAnimationFrame(() => focusId('osk:a'))
      } else firstResult()
      return true
    }
    return false
  })

  return (
    <div className="pt-8">
      <div data-bp-top="" className="flex items-center gap-4 px-16">
        <label className="relative flex h-16 w-[min(760px,60vw)] items-center">
          <SearchIcon className="pointer-events-none absolute left-6 z-20 size-7 text-white/60" strokeWidth={2.25} />
          <input
            ref={inputRef}
            data-bp=""
            data-bp-id="search-box"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels, streams and games"
            spellCheck={false}
            className={`${FOCUS} h-full w-full rounded-full bg-white/12 pr-6 pl-[72px] text-[24px] font-semibold text-white placeholder:text-white/40 focus:scale-100 focus:bg-white/18`}
          />
        </label>
        <BpButton
          id="osk-toggle"
          active={osk}
          title={osk ? 'Hide the on-screen keyboard' : 'Show the on-screen keyboard'}
          onPress={() => {
            setOsk(!osk)
            if (!osk) requestAnimationFrame(() => focusId('osk:a'))
          }}
          icon={<KeyboardIcon className="size-6" />}
        >
          Keyboard
        </BpButton>
        {query && <BpButton id="search-clear" title="Clear" onPress={() => setQuery('')} icon={<XIcon className="size-6" />} />}
      </div>

      {osk && (
        <div data-bp-top="" data-bp-osk="" className="mt-6 flex w-fit flex-col gap-2.5 rounded-3xl bg-white/6 p-5 ml-16">
          {OSK_ROWS.map((row) => (
            <div key={row} className="flex gap-2.5">
              {[...row].map((k) => (
                <OskKey key={k} id={`osk:${k}`} onPress={() => type(k)}>
                  {k.toUpperCase()}
                </OskKey>
              ))}
            </div>
          ))}
          <div className="flex gap-2.5">
            <OskKey id="osk:space" wide onPress={() => type(' ')}>
              Space
            </OskKey>
            <OskKey id="osk:delete" onPress={backspace} wide>
              <DeleteIcon className="size-6" />
            </OskKey>
            <OskKey id="osk:clear" onPress={() => setQuery('')} wide>
              Clear
            </OskKey>
            <OskKey
              id="osk:done"
              onPress={() => {
                setOsk(false)
                requestAnimationFrame(() => (document.querySelector('[data-bp-results] [data-bp]') ? firstResult() : focusEl(inputRef.current)))
              }}
              wide
            >
              Done
            </OskKey>
          </div>
          <div className="mt-1 flex justify-center">
            <Hints
              hints={[
                ['X', 'Delete'],
                ['Y', 'Space'],
                ['B', 'Close keyboard']
              ]}
            />
          </div>
        </div>
      )}

      <div data-bp-results="" className="mt-10">
        {!q ? (
          <p className="px-16 text-[20px] text-white/50">Find a channel you follow by name, or a live stream by its title or game.</p>
        ) : !channels.length && !liveRows.length ? (
          <p className="px-16 text-[20px] text-white/50">Nothing matches “{query.trim()}”.</p>
        ) : (
          <>
            {liveRows.length > 0 && (
              <Row title="Live" count={liveRows.length}>
                {liveRows.map((r) => {
                  const display = r.kind === 'group' ? r.display : r.channel
                  return (
                    <VideoCard
                      key={r.key}
                      id={`search-live:${r.key}`}
                      thumbnail={r.live.thumbnail}
                      title={r.live.title || display.displayName}
                      channel={{ name: display.displayName, avatarUrl: display.avatarUrl }}
                      subtitle={r.live.category}
                      platforms={app ? livePlatforms(r, app.live) : undefined}
                      live
                      viewers={viewersOf(r.live.viewers)}
                      onPress={() => push({ kind: 'live', key: rowChannel(r).key })}
                      menu={app ? { item: savedLive(rowChannel(r), app.live[rowChannel(r).key]), title: r.live.title || display.displayName } : undefined}
                    />
                  )
                })}
              </Row>
            )}
            {channels.length > 0 && (
              <section>
                <h2 className="px-16 text-[26px] font-bold tracking-tight text-white">
                  Channels <span className="ml-2 text-white/45 tabular-nums">{channels.length}</span>
                </h2>
                <TileGrid tiles={channels} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function OskKey({ id, wide, onPress, children }: { id: string; wide?: boolean; onPress(): void; children: React.ReactNode }): React.JSX.Element {
  return (
    <button
      type="button"
      data-bp=""
      data-bp-id={id}
      onClick={onPress}
      className={`${FOCUS} flex h-14 items-center justify-center rounded-xl bg-white/12 text-[22px] font-semibold text-white focus:bg-white focus:text-black ${wide ? 'w-[148px]' : 'w-14'}`}
    >
      {children}
    </button>
  )
}

// ---------- Watch Later and the queue ----------

export function useListItems(source: 'watchLater' | 'queue'): SavedItem[] {
  const saved = useWatchLater()
  const queued = useQueue((s) => s.items)
  return source === 'watchLater' ? saved : queued
}

function ListTab({ source }: { source: 'watchLater' | 'queue' }): React.JSX.Element {
  const items = useListItems(source)
  const app = useUi((s) => s.app)
  const entries = useVodProgress((s) => s.entries)
  const push = useBp((s) => s.push)
  if (!items.length)
    return source === 'watchLater' ? (
      <Empty icon={<BookmarkIcon className="size-16" strokeWidth={1.5} />} title="Watch Later is empty" text="Save streams and videos for later from StreamHub's usual view, and they'll be here." />
    ) : (
      <Empty icon={<ListVideoIcon className="size-16" strokeWidth={1.5} />} title="The queue is empty" text="Add videos to the queue from a channel's page." />
    )
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(22vw,360px),1fr))] gap-x-6 gap-y-4 px-16 pt-6">
      {items.map((item, index) => {
        const live = item.kind === 'channel' ? app?.live[item.channelKey] : undefined
        return (
          <VideoCard
            key={item.id}
            id={`item:${item.id}`}
            thumbnail={item.media?.thumbnail ?? live?.thumbnail ?? item.thumbnail}
            title={savedTitle(item)}
            channel={{ name: item.displayName, avatarUrl: item.avatarUrl }}
            platforms={[item.platform]}
            live={Boolean(live)}
            badge={item.media?.durationText}
            progress={item.media ? progressFraction(entries, progressKey(item.platform, item.media.id)) : null}
            onPress={() => push({ kind: 'list', source, index })}
            menu={{ item, title: savedTitle(item) }}
          />
        )
      })}
    </div>
  )
}
