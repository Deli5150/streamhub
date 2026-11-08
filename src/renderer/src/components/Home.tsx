import { ListVideoIcon, RadioIcon } from 'lucide-react'
import type { Channel, ImportedPlaylist } from '@shared/types'
import { buildLiveRows, type DisplayRow } from '../lib/combined'
import { useWallpaperIsLight } from '../lib/background'
import { formatViewers, useUi } from '../store'
import { useWatchLater } from '../lib/watchLater'
import { ChannelsHandle } from './ChannelsDrawer'
import { CoverFlow } from './CoverFlow'
import { HomeBackground } from './HomeBackground'
import { ChannelAvatar } from './ChannelAvatar'
import { useChannelMenu } from './channelMenu'
import { LiveChannelCard } from './LiveChannelCard'
import { CombinedPlatformDots, PlatformDot } from './platform'
import { Thumbnail } from './Thumbnail'
import { Button } from './ui'

const NO_PLAYLISTS: ImportedPlaylist[] = []
const HIGHLIGHTED = 3

/** The channel a row shows (a combined group's chosen member), and the one it plays. */
const rowChannel = (r: DisplayRow): Channel => (r.kind === 'group' ? r.display : r.channel)
const rowPlay = (r: DisplayRow): Channel => (r.kind === 'group' ? r.playChannel : r.channel)

/**
 * Home: the most-watched live channels right now at the top, everyone else who's live in a grid
 * under them, and the Watch Later cover flow (with imported YouTube playlists beside it) along the
 * bottom. Every followed channel, live or not, is in the Channels panel that slides out from the
 * right edge.
 */
export function Home(): React.JSX.Element {
  const { app, go } = useUi()
  const menu = useChannelMenu()
  const isLight = useWallpaperIsLight()
  const saved = useWatchLater()
  const playlists = useUi((s) => s.app?.ytPlaylists) ?? NO_PLAYLISTS
  if (!app) return <div />

  // Over a wallpaper, text switches to black/white (by the image's brightness) with a soft shadow,
  // and the live grid sits on a frosted panel so its cards stay readable.
  const over = isLight !== null
  const pick = (themed: string, dark: string, light: string): string => (over ? (isLight ? dark : light) : themed)
  const shadow = over ? (isLight ? '[text-shadow:0_1px_2px_rgba(255,255,255,0.55)]' : '[text-shadow:0_1px_3px_rgba(0,0,0,0.55)]') : ''
  const heading = `text-small-strong ${pick('text-secondary', 'text-black/75', 'text-white/90')} ${shadow}`

  const connected = app.accounts.some((a) => a.connected)
  const live = app.channels.filter((c) => app.live[c.key]).sort((a, b) => (app.live[b.key].viewers ?? 0) - (app.live[a.key].viewers ?? 0))
  const rows = buildLiveRows(live, app.channels, app.live, app.settings.combined).sort((a, b) => (b.live.viewers ?? 0) - (a.live.viewers ?? 0))
  const highlighted = rows.slice(0, HIGHLIGHTED)
  const rest = rows.slice(HIGHLIGHTED)
  const shelf = connected && (saved.length > 0 || playlists.length > 0)

  return (
    <div className="relative flex h-full flex-col">
      <HomeBackground />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-4">
          {!connected ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <h1 className={`text-heading1 font-bold ${pick('text-primary', 'text-black', 'text-white')} ${shadow}`}>StreamHub</h1>
              <p className={`max-w-md text-regular ${pick('text-tertiary', 'text-black/70', 'text-white/85')} ${shadow}`}>
                Sign in to Twitch, YouTube, Kick and Rumble to see everyone you follow in one place.
              </p>
              <Button variant="accent" size="regular" className="mt-2" onClick={() => go({ kind: 'accounts' })}>
                Connect accounts
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <RadioIcon className={`size-9 ${pick('text-quaternary', 'text-black/40', 'text-white/60')}`} strokeWidth={1.5} />
              <p className={`max-w-sm text-regular ${pick('text-tertiary', 'text-black/70', 'text-white/85')} ${shadow}`}>
                {app.syncing.length > 0 ? 'Syncing your follows…' : 'None of the channels you follow are live right now.'}
              </p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-[1600px] flex-col gap-6 pr-8">
              <section className="flex flex-col gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-support-red" aria-hidden="true" />
                  <span className={heading}>Highlighted channels</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {highlighted.map((r) => {
                    const c = rowChannel(r)
                    const l = r.live
                    return (
                      <button
                        key={r.key}
                        onClick={() => go({ kind: 'watch', key: rowPlay(r).key })}
                        onContextMenu={(e) => menu.openFor(e, c)}
                        title={`${c.displayName}${l.title ? ` — ${l.title}` : ''}`}
                        className="group min-w-0 rounded-xl text-left outline-none"
                      >
                        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-control-subtle shadow-lg ring-1 ring-separator transition-shadow group-hover:ring-secondary">
                          <Thumbnail src={l.thumbnail} />
                          <span className="absolute top-2 left-2 flex h-6 items-center gap-1 rounded-md bg-black/70 px-2 backdrop-blur-sm">
                            <span className="size-1.5 rounded-full bg-support-red" aria-hidden="true" />
                            <span className="text-small font-semibold text-white tabular-nums">{formatViewers(l.viewers) || 'LIVE'}</span>
                          </span>
                          <span className="absolute bottom-2 left-2">
                            {r.kind === 'group' ? <CombinedPlatformDots platforms={r.platforms} className="relative" /> : <PlatformDot platform={c.platform} />}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2.5">
                          <ChannelAvatar src={c.avatarUrl} name={c.displayName} className="size-8 shrink-0 rounded-full bg-control object-cover" />
                          <div className="flex min-w-0 flex-col">
                            <span className={`truncate text-strong ${pick('text-primary', 'text-black', 'text-white')} ${shadow}`}>{c.displayName}</span>
                            <span className={`truncate text-small ${pick('text-tertiary', 'text-black/70', 'text-white/85')} ${shadow}`}>
                              {l.title || l.category}
                            </span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>

              {rest.length > 0 && (
                <section className={`flex flex-col gap-3 ${over ? 'rounded-panel bg-background/75 p-4 ring-1 ring-separator backdrop-blur-xl' : ''}`}>
                  <div className="flex items-baseline gap-2">
                    <span className={over ? 'text-small-strong text-secondary' : heading}>Live now</span>
                    <span className="text-small text-tertiary tabular-nums">{rows.length}</span>
                  </div>
                  <div className="grid [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))] gap-x-4 gap-y-5">
                    {rest.map((r) => {
                      const c = rowChannel(r)
                      const play = rowPlay(r)
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
                </section>
              )}
            </div>
          )}
        </div>

        {shelf && (
          <div className="shrink-0 border-t border-separator px-6 pt-3 pb-4">
            {playlists.length > 0 ? (
              <div className="grid grid-cols-2 items-start gap-6 pr-8">
                <CoverFlow
                  compact
                  items={saved}
                  onOpen={(id) => go({ kind: 'playlist', startId: id })}
                  textClass={pick('text-primary', 'text-black', 'text-white')}
                  shadow={shadow}
                />
                <PlaylistShelf
                  playlists={playlists}
                  heading={heading}
                  title={`truncate text-small-strong ${pick('text-primary', 'text-black', 'text-white')} ${shadow}`}
                />
              </div>
            ) : (
              <CoverFlow
                compact
                items={saved}
                onOpen={(id) => go({ kind: 'playlist', startId: id })}
                textClass={pick('text-primary', 'text-black', 'text-white')}
                shadow={shadow}
              />
            )}
          </div>
        )}
      </div>
      {connected && <ChannelsHandle />}
      {menu.element}
    </div>
  )
}

/** Imported YouTube playlists (Settings → YouTube playlists), beside Watch Later. */
function PlaylistShelf({ playlists, heading, title }: { playlists: ImportedPlaylist[]; heading: string; title: string }): React.JSX.Element {
  const go = useUi((s) => s.go)
  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <span className={`flex items-center gap-1.5 ${heading}`}>
        <ListVideoIcon className="size-3.5" strokeWidth={2.5} />
        Your playlists
      </span>
      <div className="no-scrollbar flex max-w-full gap-3 overflow-x-auto px-1 pt-1 pb-1">
        {playlists.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => go({ kind: 'ytPlaylist', id: p.id })}
            disabled={p.items.length === 0}
            title={p.title}
            className="group w-[200px] shrink-0 rounded-xl text-left outline-none disabled:opacity-50"
          >
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-control-subtle shadow-lg ring-1 ring-separator transition-shadow group-hover:ring-secondary">
              <Thumbnail src={p.thumbnail} />
              <span className="absolute inset-y-0 right-0 flex w-2/5 flex-col items-center justify-center gap-0.5 bg-black/65 text-white backdrop-blur-sm">
                <ListVideoIcon className="size-4" strokeWidth={2.25} />
                <span className="text-small-strong tabular-nums">{p.items.length}</span>
              </span>
            </div>
            <span className={`mt-1.5 block ${title}`}>{p.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
