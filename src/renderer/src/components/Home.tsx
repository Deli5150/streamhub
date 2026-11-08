import { ListVideoIcon } from 'lucide-react'
import type { ImportedPlaylist } from '@shared/types'
import { buildLiveRows } from '../lib/combined'
import { useWallpaperIsLight } from '../lib/background'
import { formatViewers, useUi } from '../store'
import { useWatchLater } from '../lib/watchLater'
import { CoverFlow } from './CoverFlow'
import { HomeBackground } from './HomeBackground'
import { ChannelAvatar } from './ChannelAvatar'
import { useChannelMenu } from './channelMenu'
import { CombinedPlatformDots, PlatformDot } from './platform'
import { Thumbnail } from './Thumbnail'
import { Button } from './ui'

const NO_PLAYLISTS: ImportedPlaylist[] = []

/** Welcome screen: title + the three most-watched live channels right now. */
export function Home(): React.JSX.Element {
  const { app, go } = useUi()
  const menu = useChannelMenu()
  const isLight = useWallpaperIsLight()
  const saved = useWatchLater()
  const playlists = useUi((s) => s.app?.ytPlaylists) ?? NO_PLAYLISTS
  if (!app) return <div />

  // Over a wallpaper, text switches to black/white (by the image's brightness) with a soft shadow.
  const over = isLight !== null
  const pick = (themed: string, dark: string, light: string): string => (over ? (isLight ? dark : light) : themed)
  const shadow = over ? (isLight ? '[text-shadow:0_1px_2px_rgba(255,255,255,0.55)]' : '[text-shadow:0_1px_3px_rgba(0,0,0,0.55)]') : ''

  const connected = app.accounts.some((a) => a.connected)
  const live = app.channels
    .filter((c) => app.live[c.key])
    .sort((a, b) => (app.live[b.key].viewers ?? 0) - (app.live[a.key].viewers ?? 0))
  const highlighted = buildLiveRows(live, app.channels, app.live, app.settings.combined)
    .sort((a, b) => (b.live.viewers ?? 0) - (a.live.viewers ?? 0))
    .slice(0, 3)

  return (
    <div className="relative flex h-full flex-col">
      <HomeBackground />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-8 pt-4">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-hidden text-center">
        <div className="flex flex-col items-center gap-3">
          <h1 className={`text-heading1 font-bold ${pick('text-primary', 'text-black', 'text-white')} ${shadow}`}>StreamHub</h1>
          <p className={`max-w-md text-regular ${pick('text-tertiary', 'text-black/70', 'text-white/85')} ${shadow}`}>
            {connected
              ? 'Watch all your followed streams in one place. Pick a channel on the left to start watching.'
              : 'Sign in to Twitch, YouTube, Kick and Rumble to see everyone you follow in one place.'}
          </p>
          {!connected && (
            <Button variant="accent" size="regular" className="mt-2" onClick={() => go({ kind: 'accounts' })}>
              Connect accounts
            </Button>
          )}
          {connected && app.syncing.length > 0 && <p className="text-small text-tertiary">Syncing your follows…</p>}
        </div>
        {connected && (
          <CoverFlow
            items={saved}
            onOpen={(id) => go({ kind: 'playlist', startId: id })}
            textClass={pick('text-primary', 'text-black', 'text-white')}
            shadow={shadow}
          />
        )}
        {playlists.length > 0 && (
          <div className="flex w-full max-w-4xl shrink-0 flex-col items-center gap-3">
            <span className={`flex items-center gap-1.5 text-small-strong ${pick('text-secondary', 'text-black/75', 'text-white/90')} ${shadow}`}>
              <ListVideoIcon className="size-3.5" strokeWidth={2.5} />
              Your playlists
            </span>
            <div className="no-scrollbar flex max-w-full gap-3 overflow-x-auto px-1 pb-1">
              {playlists.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => go({ kind: 'ytPlaylist', id: p.id })}
                  disabled={p.items.length === 0}
                  title={p.title}
                  className="group w-[168px] shrink-0 rounded-xl text-left outline-none disabled:opacity-50"
                >
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-control-subtle ring-1 ring-separator transition-shadow group-hover:ring-secondary">
                    <Thumbnail src={p.thumbnail} />
                    <span className="absolute inset-y-0 right-0 flex w-2/5 flex-col items-center justify-center gap-0.5 bg-black/65 text-white backdrop-blur-sm">
                      <ListVideoIcon className="size-4" strokeWidth={2.25} />
                      <span className="text-small-strong tabular-nums">{p.items.length}</span>
                    </span>
                  </div>
                  <span className={`mt-1.5 block truncate text-small-strong ${pick('text-primary', 'text-black', 'text-white')} ${shadow}`}>{p.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {highlighted.length > 0 && (
        <div className="shrink-0 pt-2 pb-6">
          <div className="mb-3 flex items-center justify-center gap-1.5">
            <span className="size-1.5 rounded-full bg-support-red" aria-hidden="true" />
            <span className={`text-small-strong ${pick('text-secondary', 'text-black/75', 'text-white/90')} ${shadow}`}>Highlighted channels</span>
          </div>
          <div className="flex items-stretch justify-center gap-4">
            {highlighted.map((r) => {
              const c = r.kind === 'group' ? r.display : r.channel
              const play = r.kind === 'group' ? r.playChannel : r.channel
              const l = r.live
              return (
                <button
                  key={r.key}
                  onClick={() => go({ kind: 'watch', key: play.key })}
                  onContextMenu={(e) => menu.openFor(e, c)}
                  title={`${c.displayName}${l.title ? ` — ${l.title}` : ''}`}
                  className="group w-[230px] rounded-xl text-left outline-none"
                >
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-control-subtle ring-1 ring-separator transition-shadow group-hover:ring-secondary">
                    <Thumbnail src={l.thumbnail} />
                    <span className="absolute top-1.5 left-1.5 flex h-5 items-center gap-1 rounded-md bg-black/70 px-1.5 backdrop-blur-sm">
                      <span className="size-1.5 rounded-full bg-support-red" aria-hidden="true" />
                      <span className="text-small font-semibold text-white tabular-nums">{formatViewers(l.viewers) || 'LIVE'}</span>
                    </span>
                    <span className="absolute bottom-1.5 left-1.5">
                      {r.kind === 'group' ? <CombinedPlatformDots platforms={r.platforms} className="relative" /> : <PlatformDot platform={c.platform} />}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <ChannelAvatar src={c.avatarUrl} name={c.displayName} className="size-7 shrink-0 rounded-full bg-control object-cover" />
                    <div className="flex min-w-0 flex-col">
                      <span className={`truncate text-small-strong ${pick('text-primary', 'text-black', 'text-white')} ${shadow}`}>{c.displayName}</span>
                      <span className={`truncate text-small ${pick('text-tertiary', 'text-black/70', 'text-white/85')} ${shadow}`}>{l.category || l.title}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
      </div>
      {menu.element}
    </div>
  )
}
