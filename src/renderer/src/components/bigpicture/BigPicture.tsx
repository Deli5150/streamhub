import { useEffect, useState } from 'react'
import { BookmarkCheckIcon, BookmarkPlusIcon, Gamepad2Icon, ListPlusIcon, ListXIcon, LogOutIcon, PowerIcon, SearchIcon, SettingsIcon, UserIcon } from 'lucide-react'
import { focusEl, focusFirst, focusId, resetBp, startBpInput, useBp, useBpInput } from '../../lib/bigPicture'
import { groupOf } from '../../lib/combined'
import { useQueue } from '../../lib/queue'
import { useUi } from '../../store'
import { BpChannel } from './BpChannel'
import { BpHome, tabHints, useTabs } from './BpHome'
import { BpPlayer } from './BpPlayer'
import { BpSettings, PhoneSignInDialog } from './BpSettings'
import { BpButton, cardMenu, FOCUS, Hints, type CardMenu, type Hint } from './parts'

/**
 * Big Picture mode: StreamHub as a full-screen, TV-style app for the couch, navigated with a game
 * controller (d-pad or left stick to move, A to choose, B to go back, LB/RB to switch tabs), the
 * arrow keys, or the mouse. Navigation lives in lib/bigPicture.ts.
 */
export function BigPicture(): React.JSX.Element {
  const stack = useBp((s) => s.stack)
  const tab = useBp((s) => s.tab)
  const padActive = useBp((s) => s.padActive)
  const route = stack[stack.length - 1]
  const [exitOpen, setExitOpen] = useState(false)
  // The Steam copy has no usual window to go back to: leaving means quitting.
  const only = useUi((s) => s.bigPictureOnly)
  const exit = (): void => (only ? void window.api.quitApp() : useUi.getState().set({ bigPicture: false }))
  const openSettings = (): void => {
    if (route.kind !== 'settings') useBp.getState().push({ kind: 'settings' })
  }
  // The intro plays over the interface ('in'), then fades as the interface settles in ('out').
  const [intro, setIntro] = useState<'in' | 'out' | 'done'>('in')

  useEffect(() => {
    resetBp()
    void window.api.setFullScreen(true)
    const stop = startBpInput()
    return () => {
      stop()
      void window.api.setFullScreen(false)
    }
  }, [])

  // On every screen change, focus what was focused there before (going back), else its first item.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      // A channel screen places its own focus (its videos load after it opens).
      if (route.kind === 'channel') return
      if (focusId(route.focusId)) return
      if (route.kind === 'home' || route.kind === 'settings') focusFirstInMain()
      else focusFirst()
    })
    return () => cancelAnimationFrame(raf)
  }, [route])

  // Y on a stream or video: its menu (save, queue, go to channel).
  const [menu, setMenu] = useState<CardMenu | null>(null)
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null)
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])
  // A new version: said once here; it's installed from Settings, not mid-stream.
  const newVersion = useUi((s) => (s.app?.update.state === 'available' ? s.app.update.version : undefined))
  useEffect(() => {
    if (newVersion) setToast({ text: `StreamHub ${newVersion} is available: update it in Settings.`, at: Date.now() })
  }, [newVersion])

  // B on the home screen asks before leaving Big Picture; B elsewhere goes back a screen. Start opens
  // Settings (from the home and channel screens; the player uses Start itself).
  useBpInput(
    (action) => {
      if (action === 'start') {
        if (route.kind !== 'home' && route.kind !== 'channel') return false
        openSettings()
        return true
      }
      if (action === 'y') {
        const found = cardMenu((document.activeElement as HTMLElement | null)?.dataset?.bpId)
        if (found) setMenu(found)
        return Boolean(found)
      }
      if (action !== 'back') return false
      if (stack.length > 1) useBp.getState().pop()
      else setExitOpen(true)
      return true
    },
    { fallback: true }
  )

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col bg-[#0b0b10] text-white select-none ${padActive ? 'cursor-none' : ''}`}>
      <div className={`flex min-h-0 flex-1 flex-col ${intro === 'in' ? 'opacity-0' : 'bp-ui-in'}`}>
        {route.kind === 'home' || route.kind === 'channel' || route.kind === 'settings' ? (
          <>
            <Header onExit={() => setExitOpen(true)} onSettings={openSettings} showTabs={route.kind === 'home'} quits={only} />
            <main className="min-h-0 flex-1">
              {route.kind === 'home' ? (
                <BpHome />
              ) : route.kind === 'settings' ? (
                <BpSettings onToast={(text) => setToast({ text, at: Date.now() })} />
              ) : (
                <BpChannel key={route.key} channelKey={route.key} restoreId={route.focusId} />
              )}
            </main>
            <Footer
              hints={
                route.kind === 'home'
                  ? [...(only ? QUIT_HOME_HINTS : HOME_HINTS), ...tabHints(tab)]
                  : route.kind === 'settings'
                    ? SETTINGS_HINTS
                    : CHANNEL_HINTS
              }
            />
          </>
        ) : (
          <BpPlayer key={JSON.stringify(route)} route={route} />
        )}
      </div>
      {exitOpen && <ExitDialog quits={only} onExit={exit} onCancel={() => setExitOpen(false)} />}
      <PhoneSignInDialog />
      {menu && <CardMenuDialog menu={menu} onClose={() => setMenu(null)} onDone={(text) => setToast({ text, at: Date.now() })} />}
      {toast && (
        <div
          key={toast.at}
          className="bp-subtitle-in pointer-events-none fixed bottom-24 left-1/2 z-[115] -translate-x-1/2 rounded-full bg-white px-7 py-3.5 text-[19px] font-semibold text-black shadow-2xl"
        >
          {toast.text}
        </div>
      )}
      {intro !== 'done' && <Intro phase={intro} onPhase={setIntro} />}
    </div>
  )
}

const INTRO_HOLD_MS = 1900
const INTRO_FADE_MS = 500

/**
 * The opening title card: "StreamHub" sharpens into view, a rule draws out under it and "Big
 * Picture Mode" fades in beneath; then it fades away over the interface. It also covers the window
 * going full screen. Any button skips it.
 */
function Intro({ phase, onPhase }: { phase: 'in' | 'out'; onPhase(p: 'in' | 'out' | 'done'): void }): React.JSX.Element {
  useEffect(() => {
    if (phase === 'in') {
      const timer = setTimeout(() => onPhase('out'), INTRO_HOLD_MS)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => onPhase('done'), INTRO_FADE_MS)
    return () => clearTimeout(timer)
  }, [phase, onPhase])
  useBpInput(() => {
    if (phase === 'in') onPhase('out')
    return true
  })
  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[120] flex flex-col items-center justify-center overflow-hidden bg-[#0b0b10] ${phase === 'out' ? 'bp-intro-out pointer-events-none' : ''}`}
    >
      <div
        className="bp-glow-in pointer-events-none absolute size-[900px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(120,110,255,0.22), rgba(120,110,255,0.06) 45%, rgba(11,11,16,0) 70%)'
        }}
      />
      <h1 className="bp-title-in relative text-[112px] leading-none font-extrabold text-white">StreamHub</h1>
      <div
        className="bp-rule-in relative mt-8 h-[3px] w-56 rounded-full"
        style={{
          background: 'linear-gradient(to right, rgba(255,255,255,0), rgba(255,255,255,0.85), rgba(255,255,255,0))'
        }}
      />
      <p className="bp-subtitle-in relative mt-7 text-[30px] font-semibold tracking-[0.32em] text-white/75 uppercase">Big Picture Mode</p>
    </div>
  )
}

const HOME_HINTS: Hint[] = [
  ['A', 'Select'],
  ['B', 'Exit Big Picture'],
  ['Y', 'Options'],
  ['Start', 'Settings'],
  ['LB/RB', 'Switch tab']
]
const QUIT_HOME_HINTS: Hint[] = [
  ['A', 'Select'],
  ['B', 'Quit'],
  ['Y', 'Options'],
  ['Start', 'Settings'],
  ['LB/RB', 'Switch tab']
]
const SETTINGS_HINTS: Hint[] = [
  ['A', 'Select'],
  ['B', 'Back']
]
const CHANNEL_HINTS: Hint[] = [
  ['A', 'Select'],
  ['B', 'Back'],
  ['Y', 'Options'],
  ['LB/RB', 'Switch platform']
]
const TOAST_MS = 2200

/**
 * A stream's or video's menu: save it to (or take it out of) Watch Later, add it to (or take it
 * out of) the queue, or go to its channel. B closes it.
 */
function CardMenuDialog({ menu, onClose, onDone }: { menu: CardMenu; onClose(): void; onDone(text: string): void }): React.JSX.Element {
  const app = useUi((s) => s.app)
  const route = useBp((s) => s.stack[s.stack.length - 1])
  const queued = useQueue((s) => s.items.some((i) => i.id === menu.item.id))
  const saved = Boolean(app?.watchLater.some((i) => i.id === menu.item.id))
  const channel = app?.channels.find((c) => c.key === menu.item.channelKey)
  // Not offered on the channel's own page (or its combined channel's).
  const here =
    route.kind === 'channel' &&
    (route.key === menu.item.channelKey || Boolean(app && groupOf(app.settings.combined, route.key)?.memberKeys.includes(menu.item.channelKey)))

  useBpInput((action) => {
    if (action === 'back' || action === 'y') onClose()
    return !['up', 'down', 'left', 'right', 'select'].includes(action)
  })
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    requestAnimationFrame(() => focusFirst())
    return () => before?.focus({ preventScroll: true })
  }, [])

  const act = (fn: () => void, text: string): void => {
    fn()
    onClose()
    onDone(text)
  }
  return (
    <div data-bp-scope="" className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 backdrop-blur-md">
      <div className="flex w-[560px] flex-col gap-3 rounded-3xl bg-[#1a1a21] p-8 shadow-2xl ring-1 ring-white/10">
        <div className="mb-3 px-2">
          <p className="line-clamp-2 text-[24px] leading-snug font-bold text-white">{menu.title}</p>
          <p className="mt-1 truncate text-[17px] text-white/55">{menu.item.displayName}</p>
        </div>
        <MenuItem
          autoFocus
          icon={saved ? <BookmarkCheckIcon className="size-6" /> : <BookmarkPlusIcon className="size-6" />}
          onPress={() => act(() => void window.api.toggleSaved(menu.item), saved ? 'Removed from Watch Later' : 'Saved to Watch Later')}
        >
          {saved ? 'Remove from Watch Later' : 'Save to Watch Later'}
        </MenuItem>
        <MenuItem
          icon={queued ? <ListXIcon className="size-6" /> : <ListPlusIcon className="size-6" />}
          onPress={() =>
            act(
              () => (queued ? useQueue.getState().remove(menu.item.id) : useQueue.getState().add(menu.item)),
              queued ? 'Removed from the queue' : 'Added to the queue'
            )
          }
        >
          {queued ? 'Remove from queue' : 'Add to queue'}
        </MenuItem>
        {channel && !here && (
          <MenuItem
            icon={<UserIcon className="size-6" />}
            onPress={() => {
              onClose()
              // Once focus is back on the card, so coming back from the channel returns to it.
              requestAnimationFrame(() => useBp.getState().push({ kind: 'channel', key: channel.key }))
            }}
          >
            Go to channel
          </MenuItem>
        )}
      </div>
    </div>
  )
}

function MenuItem({ icon, children, onPress, autoFocus }: { icon: React.ReactNode; children: React.ReactNode; onPress(): void; autoFocus?: boolean }): React.JSX.Element {
  return (
    <button
      type="button"
      data-bp=""
      data-bp-autofocus={autoFocus ? '' : undefined}
      onClick={onPress}
      className={`${FOCUS} flex h-16 items-center gap-4 rounded-2xl bg-white/8 px-6 text-left text-[20px] font-semibold text-white focus:scale-[1.02] focus:bg-white focus:text-black`}
    >
      {icon}
      {children}
    </button>
  )
}

function Header({ onExit, onSettings, showTabs, quits }: { onExit(): void; onSettings(): void; showTabs: boolean; quits: boolean }): React.JSX.Element {
  const tabs = useTabs()
  const tab = useBp((s) => s.tab)
  const setTab = useBp((s) => s.setTab)
  const pad = useBp((s) => s.pad)
  const now = useClock()

  // LB/RB move between tabs.
  useBpInput((action) => {
    if (!showTabs || (action !== 'lb' && action !== 'rb')) return false
    const at = Math.max(
      0,
      tabs.findIndex((t) => t.id === tab)
    )
    const next = tabs[(at + (action === 'lb' ? tabs.length - 1 : 1)) % tabs.length]
    setTab(next.id)
    requestAnimationFrame(() => focusFirstInMain())
    return true
  })
  // The current tab can disappear (the queue emptied).
  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab('live')
  }, [tabs, tab, setTab])

  return (
    <header data-bp-top="" className="flex h-24 shrink-0 items-center gap-3 px-16 max-[1400px]:px-10">
      <span className="mr-8 flex shrink-0 items-center gap-3 text-[24px] font-extrabold tracking-tight whitespace-nowrap max-[1400px]:mr-3">
        <Gamepad2Icon className="size-8 text-white/80" strokeWidth={2} />
        StreamHub
      </span>
      {showTabs && (
        <nav className="flex items-center gap-2">
          {pad && <span className="mr-2 rounded-md bg-white/15 px-2 py-1 text-[13px] font-bold text-white/70">LB</span>}
          {tabs.map((t) => (
            <button
              title={t.label}
              key={t.id}
              type="button"
              data-bp=""
              data-bp-id={`tab:${t.id}`}
              onClick={() => setTab(t.id)}
              onFocus={() => setTab(t.id)}
              className={`${FOCUS} h-12 rounded-full px-6 text-[20px] font-bold whitespace-nowrap focus:bg-white focus:text-black max-[1400px]:px-4 ${t.id === tab ? 'bg-white/20 text-white' : 'text-white/55'}`}
            >
              {t.id === 'search' ? <SearchIcon className="size-6" strokeWidth={2.5} /> : t.label}
            </button>
          ))}
          {pad && <span className="ml-2 rounded-md bg-white/15 px-2 py-1 text-[13px] font-bold text-white/70">RB</span>}
        </nav>
      )}
      <div className="flex-1" />
      <span className="mr-4 text-[22px] font-semibold whitespace-nowrap text-white/80 tabular-nums max-[1400px]:mr-1">{now}</span>
      <BpButton id="settings" onPress={onSettings} icon={<SettingsIcon className="size-5" />} title="Settings (Start)" />
      <BpButton id="exit" onPress={onExit} icon={quits ? <PowerIcon className="size-5" /> : <LogOutIcon className="size-5" />} title={quits ? 'Quit StreamHub' : 'Exit Big Picture'}>
        {quits ? 'Quit' : 'Exit'}
      </BpButton>
    </header>
  )
}

/** Focus the first tile under the header (after switching tabs). */
function focusFirstInMain(): void {
  const el = document.querySelector<HTMLElement>('main [data-bp]')
  if (el) focusEl(el)
  else if (!focusId(`tab:${useBp.getState().tab}`)) focusFirst()
}

function Footer({ hints }: { hints: Hint[] }): React.JSX.Element {
  return (
    <footer className="flex h-16 shrink-0 items-center border-t border-white/8 bg-[#0b0b10]/90 px-16">
      <Hints hints={hints} />
    </footer>
  )
}

function ExitDialog({ quits, onExit, onCancel }: { quits: boolean; onExit(): void; onCancel(): void }): React.JSX.Element {
  // Only moving and choosing reach the dialog's buttons; nothing reaches the screen under it.
  useBpInput((action) => {
    if (action === 'back') onCancel()
    return !['up', 'down', 'left', 'right', 'select'].includes(action)
  })
  useEffect(() => {
    requestAnimationFrame(() => focusFirst())
    // Back where we were on closing.
    const before = document.activeElement as HTMLElement | null
    return () => before?.focus({ preventScroll: true })
  }, [])
  return (
    <div data-bp-scope="" className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="flex w-[560px] flex-col items-center gap-8 rounded-3xl bg-[#1a1a21] p-12 text-center shadow-2xl ring-1 ring-white/10">
        {quits ? <PowerIcon className="size-14 text-white/70" strokeWidth={1.5} /> : <Gamepad2Icon className="size-14 text-white/70" strokeWidth={1.5} />}
        <div>
          <p className="text-[30px] font-bold">{quits ? 'Quit StreamHub?' : 'Exit Big Picture?'}</p>
          <p className="mt-2 text-[18px] text-white/60">{quits ? 'Start it again from your library.' : 'StreamHub goes back to its usual window.'}</p>
        </div>
        <div className="flex gap-4">
          <BpButton id="exit-yes" autoFocus onPress={onExit}>
            {quits ? 'Quit' : 'Exit Big Picture'}
          </BpButton>
          <BpButton id="exit-no" onPress={onCancel}>
            Cancel
          </BpButton>
        </div>
      </div>
    </div>
  )
}

function useClock(): string {
  const fmt = (): string => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const [now, setNow] = useState(fmt)
  useEffect(() => {
    const timer = setInterval(() => setNow(fmt()), 10_000)
    return () => clearInterval(timer)
  }, [])
  return now
}
