import { BookmarkIcon, ListVideoIcon, RadioIcon } from 'lucide-react'
import type { Channel, ImportedPlaylist, SavedItem } from '@shared/types'
import { buildLiveRows, type DisplayRow } from '../lib/combined'
import { useWallpaperIsLight } from '../lib/background'
import { useUi } from '../store'
import { savedTitle, useWatchLater } from '../lib/watchLater'
import { ChannelsHandle } from './ChannelsDrawer'
import { CoverFlow, type Cover } from './CoverFlow'
import { HomeBackground } from './HomeBackground'
import { useChannelMenu } from './channelMenu'
import { LiveChannelCard } from './LiveChannelCard'
import { Button } from './ui'

const NO_PLAYLISTS: ImportedPlaylist[] = []
const HIGHLIGHTED = 3
/** Frosted panel behind Home's carousels, so they read over any wallpaper. */
const PANEL = 'rounded-panel bg-popover/80 p-3 shadow-sm ring-1 ring-separator backdrop-blur-xl'

/** The channel a row shows (a combined group's chosen member), and the one it plays. */
const rowChannel = (r: DisplayRow): Channel => (r.kind === 'group' ? r.display : r.channel)
const rowPlay = (r: DisplayRow): Channel => (r.kind === 'group' ? r.playChannel : r.channel)

const savedCover = (item: SavedItem): Cover => ({
  id: item.id,
  thumbnail: item.thumbnail,
  title: savedTitle(item),
  subtitle: item.kind === 'vod' ? item.displayName : 'Live stream',
  platform: item.platform,
  overlay:
    item.kind === 'channel' ? (
      <span className="absolute top-1.5 left-1.5 flex h-5 items-center gap-1 rounded-md bg-black/70 px-1.5 text-small font-semibold text-white backdrop-blur-sm">
        <RadioIcon className="size-3 text-support-red" strokeWidth={2.5} />
        Stream
      </span>
    ) : undefined
})

const playlistCover = (p: ImportedPlaylist): Cover => ({
  id: p.id,
  thumbnail: p.thumbnail,
  title: p.title,
  subtitle: `${p.items.length} ${p.items.length === 1 ? 'video' : 'videos'}`,
  platform: 'youtube',
  overlay: (
    <span className="absolute inset-y-0 right-0 flex w-2/5 flex-col items-center justify-center gap-0.5 bg-black/65 text-white backdrop-blur-sm">
      <ListVideoIcon className="size-4" strokeWidth={2.25} />
      <span className="text-small-strong tabular-nums">{p.items.length}</span>
    </span>
  )
})

/**
 * Home: Watch Later and imported YouTube playlists as carousels along the top, then the
 * most-watched live channels right now, then everyone else who's live. Every followed channel, live
 * or not, is in the Channels panel that slides out from the right edge.
 */
export function Home(): React.JSX.Element {
  const { app, go } = useUi()
  const menu = useChannelMenu()
  const isLight = useWallpaperIsLight()
  const saved = useWatchLater()
  const playlists = useUi((s) => s.app?.ytPlaylists) ?? NO_PLAYLISTS
  if (!app) return <div />

  // Over a wallpaper, loose text switches to black/white (by the image's brightness) with a soft shadow.
  const over = isLight !== null
  const pick = (themed: string, dark: string, light: string): string => (over ? (isLight ? dark : light) : themed)
  const shadow = over ? (isLight ? '[text-shadow:0_1px_2px_rgba(255,255,255,0.55)]' : '[text-shadow:0_1px_3px_rgba(0,0,0,0.55)]') : ''
  const heading = `text-strong ${pick('text-primary', 'text-black', 'text-white')} ${shadow}`

  const connected = app.accounts.some((a) => a.connected)
  const live = app.channels.filter((c) => app.live[c.key]).sort((a, b) => (app.live[b.key].viewers ?? 0) - (app.live[a.key].viewers ?? 0))
  const rows = buildLiveRows(live, app.channels, app.live, app.settings.combined).sort((a, b) => (b.live.viewers ?? 0) - (a.live.viewers ?? 0))
  const highlighted = rows.slice(0, HIGHLIGHTED)
  const rest = rows.slice(HIGHLIGHTED)

  const card = (r: DisplayRow, rank?: number): React.JSX.Element => {
    const c = rowChannel(r)
    const play = rowPlay(r)
    return (
      <LiveChannelCard
        key={r.key}
        channel={c}
        live={r.live}
        rank={rank}
        combinedPlatforms={r.kind === 'group' ? r.platforms : undefined}
        onSelect={() => go({ kind: 'watch', key: play.key })}
        onOpenChannel={() => go({ kind: 'watch', key: play.key, offline: true })}
        onContextMenu={(e) => menu.openFor(e, c)}
      />
    )
  }

  const watchLater = (
    <div className={`${PANEL} min-w-0`}>
      <CoverFlow
        label={
          <>
            <BookmarkIcon className="size-3.5" strokeWidth={2.5} />
            Saved · Watch Later
            <span className="text-tertiary tabular-nums">{saved.length}</span>
          </>
        }
        covers={saved.map(savedCover)}
        onOpen={(id) => go({ kind: 'playlist', startId: id })}
        empty={
          <p className="max-w-xs text-center text-small text-tertiary">Press “Save for Later” under any stream, or on a past video, and it’ll show up here.</p>
        }
      />
    </div>
  )

  return (
    <div className="relative flex h-full flex-col">
      <HomeBackground />
      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
        {!connected ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <h1 className={`text-heading1 font-bold ${pick('text-primary', 'text-black', 'text-white')} ${shadow}`}>StreamHub</h1>
            <p className={`max-w-md text-regular ${pick('text-tertiary', 'text-black/70', 'text-white/85')} ${shadow}`}>
              Sign in to Twitch, YouTube, Kick and Rumble to see everyone you follow in one place.
            </p>
            <Button variant="accent" size="regular" className="mt-2" onClick={() => go({ kind: 'accounts' })}>
              Connect accounts
            </Button>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-12 py-4">
            {playlists.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                {watchLater}
                <div className={`${PANEL} min-w-0`}>
                  <CoverFlow
                    label={
                      <>
                        <ListVideoIcon className="size-3.5" strokeWidth={2.5} />
                        Your playlists
                        <span className="text-tertiary tabular-nums">{playlists.length}</span>
                      </>
                    }
                    covers={playlists.map(playlistCover)}
                    onOpen={(id) => go({ kind: 'ytPlaylist', id })}
                  />
                </div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-2xl">{watchLater}</div>
            )}

            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <RadioIcon className={`size-9 ${pick('text-quaternary', 'text-black/40', 'text-white/60')}`} strokeWidth={1.5} />
                <p className={`max-w-sm text-regular ${pick('text-tertiary', 'text-black/70', 'text-white/85')} ${shadow}`}>
                  {app.syncing.length > 0 ? 'Syncing your follows…' : 'None of the channels you follow are live right now.'}
                </p>
              </div>
            ) : (
              <>
                <section className="flex flex-col gap-3">
                  <div className="flex items-center justify-center gap-2">
                    <span className="size-2 rounded-full bg-support-red" aria-hidden="true" />
                    <span className={heading}>Highlighted channels</span>
                  </div>
                  <div className="grid justify-center [grid-template-columns:repeat(auto-fit,minmax(250px,320px))] gap-4">
                    {highlighted.map((r, i) => card(r, i + 1))}
                  </div>
                </section>
                {rest.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-center gap-2">
                      <span className={heading}>Live now</span>
                      <span className={`text-small tabular-nums ${pick('text-tertiary', 'text-black/60', 'text-white/75')} ${shadow}`}>{rest.length} more</span>
                    </div>
                    <div className="grid justify-center [grid-template-columns:repeat(auto-fill,minmax(220px,250px))] gap-4">{rest.map((r) => card(r))}</div>
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {connected && <ChannelsHandle />}
      {menu.element}
    </div>
  )
}
