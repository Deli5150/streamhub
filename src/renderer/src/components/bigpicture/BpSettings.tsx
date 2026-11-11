import { useEffect, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import { BugIcon, CheckIcon, CloudIcon, DownloadIcon, LightbulbIcon, ListVideoIcon, LogOutIcon, PowerIcon, RefreshCwIcon, SmartphoneIcon, Trash2Icon, UserIcon } from 'lucide-react'
import { feedbackUrl, feedbackWhere, type FeedbackKind } from '@shared/feedback'
import { changelogSection } from '@shared/release'
import { PLATFORM_LABEL, PLATFORMS, type AccountInfo, type Platform, type YouTubePlaylistSummary } from '@shared/types'
import changelog from '../../../../../CHANGELOG.md?raw'
import { focusFirst, useBpInput } from '../../lib/bigPicture'
import { errorMessage, useUi } from '../../store'
import { PLATFORM_META } from '../platform'
import { Thumbnail } from '../Thumbnail'
import { ReleaseNotes } from '../Updates'
import { BpButton, FOCUS } from './parts'

// Big Picture's Settings: everything the usual window's settings and Accounts page offer that
// matters on a TV, for the controller. On the Steam copy (Big Picture is the whole app) it's the only
// place for them. Sign-ins come over through Sync with Google from your phone or computer, or
// happen right here in a sign-in window. Feedback goes to GitHub through a QR code, so it's written
// on a phone rather than with the controller.

type Toast = (text: string) => void

export function BpSettings({ onToast }: { onToast: Toast }): React.JSX.Element {
  const app = useUi((s) => s.app)
  const [importing, setImporting] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackKind | null>(null)
  if (!app) return <div />
  return (
    <div data-bp-scroller="" className="h-full overflow-y-auto pb-24 [scrollbar-width:none]">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-12 px-16 pt-4">
        <h1 className="text-[44px] font-extrabold tracking-tight">Settings</h1>
        <UpdatesSection />
        <SyncSection onToast={onToast} />
        <AccountsSection onToast={onToast} />
        <PlaylistsSection onImport={() => setImporting(true)} onToast={onToast} />
        <Section title="Playback and alerts">
          <Toggle
            id="set:ads"
            title="Block Twitch ads"
            detail="During Twitch ad breaks, plays an ad-free copy of the stream instead."
            on={app.settings.blockTwitchAds}
            onChange={(v) => void window.api.updateSettings({ blockTwitchAds: v })}
          />
          <Toggle
            id="set:alerts"
            title="Go-live alerts"
            detail="A notification when a channel you follow starts streaming."
            on={app.settings.notifyLive}
            onChange={(v) => void window.api.updateSettings({ notifyLive: v })}
          />
        </Section>
        <FeedbackSection onOpen={setFeedback} />
        <AppSection />
      </div>
      {importing && <ImportDialog onClose={() => setImporting(false)} onToast={onToast} />}
      {feedback && <FeedbackQr kind={feedback} onClose={() => setFeedback(null)} />}
    </div>
  )
}

function Section({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-[28px] font-bold tracking-tight">{title}</h2>
        {intro && <p className="mt-1.5 max-w-3xl text-[18px] leading-snug text-white/60">{intro}</p>}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

/** A settings row: what it is on the left, its buttons on the right. */
function SettingRow({
  icon,
  title,
  detail,
  children,
  error
}: {
  icon?: ReactNode
  title: ReactNode
  detail?: ReactNode
  children?: ReactNode
  error?: string
}): React.JSX.Element {
  return (
    <div className="flex min-h-24 items-center gap-6 rounded-3xl bg-white/6 px-7 py-5 ring-1 ring-white/8">
      {icon && <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[22px] font-semibold">{title}</p>
        {detail && <p className="mt-0.5 text-[17px] leading-snug text-white/60">{detail}</p>}
        {error && <p className="mt-1 text-[16px] text-[#ff7b7b]">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </div>
  )
}

function Toggle({
  id,
  title,
  detail,
  on,
  onChange
}: {
  id: string
  title: string
  detail: string
  on: boolean
  onChange(v: boolean): void
}): React.JSX.Element {
  return (
    <SettingRow title={title} detail={detail}>
      <button
        type="button"
        data-bp=""
        data-bp-id={id}
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`${FOCUS} flex h-14 w-36 items-center justify-center gap-2 rounded-full text-[19px] font-bold focus:ring-0 ${on ? 'bg-[#3fae49] text-white' : 'bg-white/15 text-white/80'}`}
      >
        {on && <CheckIcon className="size-5" strokeWidth={3} />}
        {on ? 'On' : 'Off'}
      </button>
    </SettingRow>
  )
}

/** Runs an action, toasting its error (or `done` when it finishes). */
function useRun(onToast: Toast): { busy: string | null; run(id: string, op: () => Promise<unknown>, done?: string): void } {
  const [busy, setBusy] = useState<string | null>(null)
  return {
    busy,
    run(id, op, done) {
      setBusy(id)
      op()
        .then(() => done && onToast(done))
        .catch((e) => {
          const message = errorMessage(e)
          if (!/cancelled/i.test(message)) onToast(message)
        })
        .finally(() => setBusy(null))
    }
  }
}

// ---------- Sync and accounts ----------

function SyncSection({ onToast }: { onToast: Toast }): React.JSX.Element {
  const sync = useUi((s) => s.app!.sync)
  const { busy, run } = useRun(onToast)
  return (
    <Section
      title="Sync with Google"
      intro="Brings your sign-ins, channels, combined channels, Watch Later and playlists over from StreamHub on your phone or computer, and keeps them the same everywhere."
    >
      <SettingRow
        icon={<CloudIcon className="size-6" />}
        title={sync.signedIn ? `On${sync.email ? ` · ${sync.email}` : ''}` : 'Off'}
        detail={
          sync.signedIn
            ? sync.syncing
              ? 'Syncing now…'
              : sync.lastSync
                ? `Last synced ${ago(sync.lastSync)}`
                : 'Not synced yet'
            : 'Sign in with Google to turn it on.'
        }
        error={sync.error}
      >
        {sync.signedIn ? (
          <>
            <BpButton
              id="sync:now"
              icon={<RefreshCwIcon className={`size-5 ${sync.syncing ? 'animate-spin' : ''}`} />}
              onPress={() => run('now', () => window.api.syncNow())}
            >
              Sync now
            </BpButton>
            <BpButton id="sync:off" onPress={() => run('off', () => window.api.syncSignOut(), 'Sync with Google is off')}>
              Turn off
            </BpButton>
          </>
        ) : (
          <BpButton
            id="sync:on"
            icon={<UserIcon className="size-5" />}
            onPress={() => run('on', () => window.api.syncSignIn(), 'Sync with Google is on')}
          >
            {busy === 'on' ? 'Signing in…' : 'Sign in'}
          </BpButton>
        )}
      </SettingRow>
    </Section>
  )
}

function AccountsSection({ onToast }: { onToast: Toast }): React.JSX.Element {
  const accounts = useUi((s) => s.app!.accounts)
  const channels = useUi((s) => s.app!.channels)
  const syncOn = useUi((s) => s.app!.sync.signedIn)
  return (
    <Section
      title="Accounts"
      intro={
        syncOn
          ? 'Sign-ins from StreamHub on your phone or computer come over by themselves with Sync with Google. To sign in here instead, choose Sign in.'
          : 'Easiest: turn on Sync with Google above, and the platforms you’re signed in to in StreamHub on your phone or computer come over by themselves. Or sign in here.'
      }
    >
      {PLATFORMS.map((p) => (
        <AccountRow
          key={p}
          account={accounts.find((a) => a.platform === p) ?? { platform: p, connected: false }}
          count={channels.filter((c) => c.platform === p).length}
          onToast={onToast}
        />
      ))}
    </Section>
  )
}

function AccountRow({ account: a, count, onToast }: { account: AccountInfo; count: number; onToast: Toast }): React.JSX.Element {
  const { busy, run } = useRun(onToast)
  const meta = PLATFORM_META[a.platform]
  const label = PLATFORM_LABEL[a.platform]
  const name = a.username && a.username !== 'Signed in' ? `Signed in as ${a.username}` : 'Signed in'
  return (
    <SettingRow
      icon={<meta.Icon className={`size-6 ${meta.accent}`} strokeWidth={2.5} />}
      title={label}
      detail={a.connected ? `${name} · ${count} ${count === 1 ? 'channel' : 'channels'}` : 'Not signed in'}
      error={a.error}
    >
      {a.connected && !a.error ? (
        <BpButton
          id={`acct:${a.platform}:out`}
          icon={<LogOutIcon className="size-5" />}
          onPress={() => run('out', () => window.api.logout(a.platform), `Signed out of ${label}`)}
        >
          Sign out
        </BpButton>
      ) : (
        <BpButton
          id={`acct:${a.platform}:in`}
          icon={<UserIcon className="size-5" />}
          onPress={() => run('in', () => window.api.login(a.platform as Platform), `Signed in to ${label}`)}
        >
          {busy === 'in' ? 'Signing in…' : a.error ? 'Sign in again' : 'Sign in'}
        </BpButton>
      )}
    </SettingRow>
  )
}

/**
 * The QR code for a Google sign-in waiting on a phone: it opens google.com/device, where you enter
 * the code shown here. Closes by itself once you approve (or when cancelled with B).
 */
export function PhoneSignInDialog(): React.JSX.Element | null {
  const pending = useUi((s) => s.app?.phoneSignIn ?? null)
  const [image, setImage] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!pending) return
    let alive = true
    void QRCode.toDataURL(pending.url, { width: 640, margin: 2, errorCorrectionLevel: 'M' }).then((data) => alive && setImage(data))
    const timer = setInterval(() => setNow(Date.now()), 1000)
    requestAnimationFrame(() => focusFirst())
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [pending])
  useBpInput(
    (action) => {
      if (!pending) return false
      if (action === 'back') void window.api.cancelPhoneSignIn()
      return !['up', 'down', 'left', 'right', 'select'].includes(action)
    },
    { fallback: false }
  )
  if (!pending) return null
  const left = Math.max(0, Math.round((pending.expiresAt - now) / 1000))
  return (
    <div data-bp-scope="" className="fixed inset-0 z-[112] flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="flex w-[980px] items-center gap-12 rounded-3xl bg-[#1a1a21] p-12 shadow-2xl ring-1 ring-white/10">
        <div className="grid size-[340px] shrink-0 place-items-center rounded-2xl bg-white p-3">
          {image ? <img src={image} alt={`QR code for ${pending.url}`} className="size-full [image-rendering:pixelated]" /> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <div>
            <p className="flex items-center gap-3 text-[30px] font-bold">
              <SmartphoneIcon className="size-7" />
              {pending.target === 'sync' ? 'Turn on Sync with Google' : 'Sign in to YouTube'}
            </p>
            <p className="mt-3 text-[19px] leading-snug text-white/70">
              Scan the code with your phone’s camera (or go to{' '}
              <span className="font-semibold text-white">{pending.url.replace(/^https?:\/\/(www\.)?/, '')}</span>), sign in to Google there, and enter this
              code:
            </p>
          </div>
          <p className="rounded-2xl bg-white/10 px-6 py-4 text-center font-mono text-[46px] font-bold tracking-[0.18em]">{pending.code}</p>
          <p className="text-[17px] text-white/55">
            StreamHub continues by itself once you allow it. The code works for {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} more.
          </p>
          <div>
            <BpButton id="phone:cancel" autoFocus onPress={() => void window.api.cancelPhoneSignIn()}>
              Cancel
            </BpButton>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Feedback ----------

function FeedbackSection({ onOpen }: { onOpen(kind: FeedbackKind): void }): React.JSX.Element {
  return (
    <Section title="Feedback" intro="Report a problem or suggest something new. A QR code opens the form on your phone, ready to fill in and send.">
      <SettingRow icon={<BugIcon className="size-6" />} title="Report a bug" detail="Something isn’t working right.">
        <BpButton id="fb:bug" onPress={() => onOpen('bug')}>
          Report
        </BpButton>
      </SettingRow>
      <SettingRow icon={<LightbulbIcon className="size-6" />} title="Suggest a feature" detail="Something StreamHub should do.">
        <BpButton id="fb:feature" onPress={() => onOpen('feature')}>
          Suggest
        </BpButton>
      </SettingRow>
    </Section>
  )
}

/** The feedback form's QR code: GitHub's issue form, with this device and version filled in. */
function FeedbackQr({ kind, onClose }: { kind: FeedbackKind; onClose(): void }): React.JSX.Element {
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void window.api.feedbackInfo().then(({ version, steam }) => {
      const url = feedbackUrl({ kind, title: '', text: '', where: feedbackWhere(kind, window.api.platform, { bigPicture: true, steam }), version })
      return QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: 'L' }).then((data) => alive && setImage(data))
    })
    requestAnimationFrame(() => focusFirst())
    const before = document.activeElement as HTMLElement | null
    return () => {
      alive = false
      before?.focus({ preventScroll: true })
    }
  }, [kind])
  useBpInput((action) => {
    if (action === 'back') onClose()
    return !['up', 'down', 'left', 'right', 'select'].includes(action)
  })
  return (
    <div data-bp-scope="" className="fixed inset-0 z-[112] flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="flex w-[980px] items-center gap-12 rounded-3xl bg-[#1a1a21] p-12 shadow-2xl ring-1 ring-white/10">
        <div className="grid size-[340px] shrink-0 place-items-center rounded-2xl bg-white p-3">
          {image ? <img src={image} alt="QR code for the feedback form" className="size-full [image-rendering:pixelated]" /> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <div>
            <p className="flex items-center gap-3 text-[30px] font-bold">
              {kind === 'bug' ? <BugIcon className="size-7" /> : <LightbulbIcon className="size-7" />}
              {kind === 'bug' ? 'Report a bug' : 'Suggest a feature'}
            </p>
            <p className="mt-3 text-[19px] leading-snug text-white/70">
              Scan the code with your phone’s camera. The form opens on GitHub with this device and StreamHub’s version filled in; write what happened (or your
              idea) and submit it. You’ll need a free GitHub account.
            </p>
          </div>
          <div>
            <BpButton id="fb:close" autoFocus onPress={onClose}>
              Done
            </BpButton>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- YouTube playlists ----------

function PlaylistsSection({ onImport, onToast }: { onImport(): void; onToast: Toast }): React.JSX.Element {
  const playlists = useUi((s) => s.app!.ytPlaylists)
  const youtube = useUi((s) => Boolean(s.app!.accounts.find((a) => a.platform === 'youtube')?.connected))
  const { busy, run } = useRun(onToast)
  return (
    <Section title="YouTube playlists" intro="Playlists from your YouTube account, in Watch Later's player. They keep up with changes on YouTube.">
      <SettingRow
        icon={<ListVideoIcon className="size-6" />}
        title={playlists.length ? `${playlists.length} imported` : 'None imported yet'}
        detail={youtube ? 'Pick playlists from your YouTube account.' : 'Sign in to YouTube (in Accounts, above) first.'}
      >
        {youtube && (
          <BpButton id="pl:import" icon={<DownloadIcon className="size-5" />} onPress={onImport}>
            Import playlists
          </BpButton>
        )}
      </SettingRow>
      {playlists.map((p) => (
        <SettingRow
          key={p.id}
          icon={<ListVideoIcon className="size-6 text-white/60" />}
          title={p.title}
          detail={`${p.items.length} ${p.items.length === 1 ? 'video' : 'videos'}`}
        >
          <BpButton
            id={`pl:${p.id}:refresh`}
            icon={<RefreshCwIcon className={`size-5 ${busy === p.id ? 'animate-spin' : ''}`} />}
            title="Get its latest videos"
            onPress={() => run(p.id, () => window.api.refreshYouTubePlaylist(p.id), `${p.title} is up to date`)}
          />
          <BpButton
            id={`pl:${p.id}:remove`}
            icon={<Trash2Icon className="size-5" />}
            title="Remove"
            onPress={() => run(`rm:${p.id}`, () => window.api.removeYouTubePlaylist(p.id), `Removed ${p.title}`)}
          />
        </SettingRow>
      ))}
    </Section>
  )
}

/** Pick playlists to import: A ticks one, Import confirms, B closes. */
function ImportDialog({ onClose, onToast }: { onClose(): void; onToast: Toast }): React.JSX.Element {
  const imported = useUi((s) => s.app?.ytPlaylists ?? [])
  const [list, setList] = useState<YouTubePlaylistSummary[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  useEffect(() => {
    window.api.listYouTubePlaylists().then(
      (l) => {
        setList(l)
        requestAnimationFrame(() => focusFirst())
      },
      (e) => {
        onToast(errorMessage(e))
        onClose()
      }
    )
    // Back where we were on closing.
    const before = document.activeElement as HTMLElement | null
    return () => before?.focus({ preventScroll: true })
  }, [])
  useBpInput((action) => {
    if (action === 'back' && !importing) onClose()
    return !['up', 'down', 'left', 'right', 'select'].includes(action)
  })
  const confirm = (): void => {
    setImporting(true)
    window.api
      .importYouTubePlaylists(picked)
      .then(() => {
        onToast(`Imported ${picked.length} ${picked.length === 1 ? 'playlist' : 'playlists'}`)
        onClose()
      })
      .catch((e) => onToast(errorMessage(e)))
      .finally(() => setImporting(false))
  }
  return (
    <div data-bp-scope="" className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 backdrop-blur-md">
      <div className="flex max-h-[88vh] w-[1100px] flex-col gap-6 rounded-3xl bg-[#1a1a21] p-10 shadow-2xl ring-1 ring-white/10">
        <div className="flex items-center gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-[30px] font-bold">Import YouTube playlists</p>
            <p className="mt-1 text-[18px] text-white/60">Choose the ones you want, then Import. (YouTube doesn’t share your Watch Later list with apps.)</p>
          </div>
          <BpButton id="imp:go" icon={<CheckIcon className="size-5" />} onPress={() => picked.length && !importing && confirm()}>
            {importing ? 'Importing…' : `Import ${picked.length || ''}`.trim()}
          </BpButton>
          <BpButton id="imp:close" onPress={onClose}>
            Close
          </BpButton>
        </div>
        {!list ? (
          <p className="py-16 text-center text-[20px] text-white/60">Loading your playlists…</p>
        ) : (
          <div data-bp-scroller="" className="grid min-h-0 grid-cols-3 gap-5 overflow-y-auto p-2 [scrollbar-width:none]">
            {list.map((p, i) => {
              const done = imported.some((x) => x.id === p.id)
              const on = done || picked.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  data-bp=""
                  data-bp-id={`imp:${p.id}`}
                  data-bp-autofocus={i === 0 ? '' : undefined}
                  disabled={done}
                  onClick={() => setPicked((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                  className={`${FOCUS} flex flex-col gap-3 rounded-2xl p-3 text-left focus:bg-white/12 ${on ? 'bg-white/10 ring-2 ring-[#3fae49]' : 'bg-white/4'} ${done ? 'opacity-55' : ''}`}
                >
                  <span className="relative block aspect-video overflow-hidden rounded-xl bg-white/10">
                    <Thumbnail src={p.thumbnail} />
                    {on && (
                      <span className="absolute top-2 left-2 flex size-9 items-center justify-center rounded-full bg-[#3fae49]">
                        <CheckIcon className="size-5 text-white" strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  <span className="truncate text-[19px] font-semibold">{p.title}</span>
                  <span className="-mt-2 text-[15px] text-white/55">{done ? 'Imported' : p.count !== undefined ? `${p.count} videos` : ' '}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Updates and the app ----------

function UpdatesSection(): React.JSX.Element {
  const app = useUi((s) => s.app!)
  const u = app.update
  const notes = changelogSection(changelog, u.current)
  const status =
    u.state === 'checking'
      ? 'Checking…'
      : u.state === 'latest'
        ? 'You’re up to date.'
        : u.state === 'available'
          ? `StreamHub ${u.version} is available.`
          : u.state === 'downloading'
            ? `Downloading StreamHub ${u.version}… ${Math.round((u.progress ?? 0) * 100)}%`
            : u.state === 'ready'
              ? u.closesToInstall
                ? `StreamHub ${u.version} is ready. Installing closes StreamHub: start it again from your library.`
                : `StreamHub ${u.version} is ready. StreamHub restarts to finish.`
              : u.state === 'installing'
                ? 'Installing…'
                : u.state === 'error'
                  ? (u.error ?? 'Something went wrong.')
                  : 'Updates come from StreamHub’s releases on GitHub.'
  const action =
    u.state === 'available'
      ? u.inApp
        ? { label: `Update to ${u.version}`, run: () => void window.api.downloadUpdate() }
        : null
      : u.state === 'ready'
        ? { label: u.closesToInstall ? 'Install and close' : 'Restart to update', run: () => void window.api.installUpdate() }
        : u.state === 'error' && u.version && u.inApp
          ? { label: 'Try again', run: () => void window.api.downloadUpdate() }
          : null
  return (
    <Section title="Updates" intro={`You have StreamHub ${u.current}.`}>
      <SettingRow icon={<DownloadIcon className="size-6" />} title={status}>
        {action ? (
          <BpButton id="upd:go" onPress={action.run}>
            {action.label}
          </BpButton>
        ) : (
          <BpButton
            id="upd:check"
            icon={<RefreshCwIcon className={`size-5 ${u.state === 'checking' ? 'animate-spin' : ''}`} />}
            onPress={() => void window.api.checkForUpdates()}
          >
            Check now
          </BpButton>
        )}
      </SettingRow>
      <Toggle
        id="upd:auto"
        title="Check automatically"
        detail="Looks for a new version when StreamHub opens and every few hours."
        on={app.settings.checkUpdates}
        onChange={(v) => void window.api.updateSettings({ checkUpdates: v })}
      />
      {u.version && u.notes && ['available', 'downloading', 'ready'].includes(u.state) && <Notes title={`What's new in ${u.version}`} md={u.notes} />}
      {notes && <Notes title={`What's new in this version (${u.current})`} md={notes} />}
    </Section>
  )
}

function Notes({ title, md }: { title: string; md: string }): React.JSX.Element {
  return (
    <div className="rounded-3xl bg-white/6 px-7 py-6 ring-1 ring-white/8">
      <p className="mb-3 text-[16px] font-bold tracking-wide text-white/50 uppercase">{title}</p>
      <ReleaseNotes md={md} className="gap-3 text-[17px] leading-snug text-white/70 [&_.note-strong]:text-white" />
    </div>
  )
}

function AppSection(): React.JSX.Element | null {
  const only = useUi((s) => s.bigPictureOnly)
  if (!only) return null
  return (
    <Section title="StreamHub">
      <SettingRow icon={<PowerIcon className="size-6" />} title="Quit StreamHub" detail="Closes StreamHub. Start it again from your library.">
        <BpButton id="app:quit" icon={<PowerIcon className="size-5" />} onPress={() => void window.api.quitApp()}>
          Quit
        </BpButton>
      </SettingRow>
    </Section>
  )
}

function ago(at: number): string {
  const min = Math.round((Date.now() - at) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  return `${Math.round(min / 60)} h ago`
}
