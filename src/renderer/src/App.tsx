import { useEffect, type ReactNode } from 'react'
import { CircleUserIcon, HomeIcon, LayoutGridIcon, ListIcon, ListVideoIcon } from 'lucide-react'
import { useQueue } from './lib/queue'
import { applyColorway } from './lib/theme'
import { applySystemAppearance, useUi } from './store'
import { openPipFor } from './components/channelMenu'
import { CombineDialog } from './components/CombineDialog'
import { MultiViewDialog } from './components/MultiViewDialog'
import { QuickActions } from './components/QuickActions'
import { Accounts } from './components/Accounts'
import { ChannelsPage } from './components/ChannelsPage'
import { Home } from './components/Home'
import { PlaylistView } from './components/PlaylistView'
import { MultiView } from './components/MultiView'
import { Sidebar } from './components/Sidebar'
import { Watch } from './components/Watch'
import { BigPicture } from './components/bigpicture/BigPicture'

let startedBigPicture = false

export function App(): React.JSX.Element {
  const { view, multi, go, setApp, app, combine, set, theater, bigPicture } = useUi()
  const theme = app?.settings.theme ?? 'default'
  const queued = useQueue((s) => s.items.length)

  useEffect(() => applyColorway(theme), [theme])

  // Shortcuts arrive from the native Controls menu (so they work even over a focused stream).
  useEffect(
    () =>
      window.api.onShortcut((action) => {
        const s = useUi.getState()
        const watching = s.view.kind === 'watch' && s.app?.live[s.view.key] ? s.view.key : null
        if (action === 'toggleSidebar') s.set({ collapsed: !s.collapsed })
        else if (action === 'returnHome') s.go({ kind: 'home' })
        else if (action === 'multiView') s.set({ multiPicker: s.multi.length ? s.multi : watching ? [watching] : [] })
        else if (action === 'pip') {
          const key = watching ?? (s.view.kind === 'multi' ? s.focused : null)
          const channel = key ? s.app?.channels.find((c) => c.key === key) : undefined
          if (channel) openPipFor(channel)
        }
      }),
    []
  )

  useEffect(() => {
    applySystemAppearance()
    void Promise.all([window.api.getState(), window.api.launchBigPicture()]).then(([state, launch]) => {
      setApp(state)
      // Settings → Playback, or launched for it (Steam's Game Mode, --big-picture): start in Big
      // Picture (once, not on every state refresh).
      if ((state.settings.bigPictureOnStartup || launch) && !startedBigPicture) {
        startedBigPicture = true
        set({ bigPicture: true })
      }
    })
    const offState = window.api.onState(setApp)
    const offOpen = window.api.onOpenChannel((key) => go({ kind: 'watch', key }))
    const offPip = window.api.onPipState((pip) => set({ pip }))
    return () => {
      offState()
      offOpen()
      offPip()
    }
  }, [setApp, go, set])

  const channelCount = app?.channels.length ?? 0
  // Theater mode (Watch.tsx) gives a live stream the whole window.
  const theaterOn = theater && view.kind === 'watch' && !view.offline && Boolean(app?.live[view.key])

  if (bigPicture) return <BigPicture />

  return (
    <div className="flex h-full flex-col">
      {/* Browser-style tab strip doubling as the toolbar; on macOS the left padding clears the traffic lights. */}
      <header
        className={`drag-region flex h-11 shrink-0 items-center gap-1.5 border-b border-separator bg-background/40 pr-3 ${window.api.platform === 'darwin' ? 'pl-20' : 'pl-3'}`}
      >
        <TabButton active={view.kind === 'home'} onClick={() => go({ kind: 'home' })}>
          <HomeIcon className="size-4 shrink-0" strokeWidth={2.5} />
          Home
        </TabButton>
        <TabButton active={view.kind === 'channels'} onClick={() => go({ kind: 'channels' })} disabled={channelCount === 0}>
          <ListIcon className="size-4 shrink-0" strokeWidth={2.5} />
          Channels
          {channelCount > 0 && <span className="text-small text-secondary tabular-nums">{channelCount}</span>}
        </TabButton>
        <TabButton active={view.kind === 'multi'} onClick={() => go({ kind: 'multi' })}>
          <LayoutGridIcon className="size-4 shrink-0" strokeWidth={2.5} />
          Multi-view
          {multi.length > 0 && <span className="text-small text-secondary tabular-nums">{multi.length}</span>}
        </TabButton>
        {(queued > 0 || view.kind === 'queue') && (
          <TabButton active={view.kind === 'queue'} onClick={() => go({ kind: 'queue' })}>
            <ListVideoIcon className="size-4 shrink-0" strokeWidth={2.5} />
            Queue
            <span className="text-small text-secondary tabular-nums">{queued}</span>
          </TabButton>
        )}
        <div className="flex-1" />
        {app && app.syncing.length > 0 && <span className="mr-1 text-small text-tertiary">Syncing…</span>}
        <QuickActions />
        <div className="mx-1 h-4 w-px bg-separator" />
        <TabButton active={view.kind === 'accounts'} onClick={() => go({ kind: 'accounts' })}>
          <CircleUserIcon className="size-4 shrink-0" strokeWidth={2.5} />
          Accounts
        </TabButton>
      </header>
      <div className="flex min-h-0 flex-1">
        {!theaterOn && <Sidebar />}
        <main className="min-w-0 flex-1">
          {view.kind === 'home' && <Home />}
          {view.kind === 'channels' && <ChannelsPage />}
          {view.kind === 'accounts' && <Accounts />}
          {view.kind === 'watch' && <Watch channelKey={view.key} offline={view.offline} />}
          {view.kind === 'multi' && <MultiView />}
          {view.kind === 'playlist' && <PlaylistView key={view.startId} startId={view.startId} />}
          {view.kind === 'queue' && <PlaylistView key="queue" source="queue" />}
        </main>
      </div>
      <CombineDialog request={combine} onClose={() => set({ combine: null })} />
      <MultiViewDialog />
    </div>
  )
}

function TabButton({
  active,
  onClick,
  disabled,
  children
}: {
  active: boolean
  onClick(): void
  disabled?: boolean
  children: ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`no-drag flex h-7 items-center gap-1.5 rounded-md px-3 text-small-strong transition-colors disabled:opacity-40 ${
        active ? 'bg-control text-primary' : 'text-secondary hover:bg-control-subtle hover:text-primary'
      }`}
    >
      {children}
    </button>
  )
}
