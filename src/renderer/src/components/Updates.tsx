import { CircleArrowUpIcon, ExternalLinkIcon, Loader2Icon, RotateCwIcon } from 'lucide-react'
import { changelogSection, RELEASE_REPO } from '@shared/release'
import type { UpdateStatus } from '@shared/types'
// This version's notes come with the app (so they show offline, and for the version you're running).
import changelog from '../../../../CHANGELOG.md?raw'
import { useUi } from '../store'
import { Button, Field, FieldGroup, Switch } from './ui'

// The in-app updater's controls (main/updater.ts): a pill in the toolbar while a new version is on
// its way, and Settings → Updates.

/** What the one update button does next, and its label. */
function nextStep(u: UpdateStatus): { label: string; run(): void } | null {
  const page = (): void => void window.api.openExternal(u.page ?? '')
  if (u.state === 'available')
    return u.inApp ? { label: `Update to ${u.version}`, run: () => void window.api.downloadUpdate() } : { label: `Get ${u.version}`, run: page }
  if (u.state === 'ready') return { label: u.closesToInstall ? 'Install and close' : 'Restart to update', run: () => void window.api.installUpdate() }
  if (u.state === 'error' && u.version)
    return u.inApp ? { label: 'Try again', run: () => void window.api.downloadUpdate() } : { label: 'Release page', run: page }
  return null
}

/** Toolbar pill: shows up once a newer version is found, with its download progress. */
export function UpdatePill(): React.JSX.Element | null {
  const u = useUi((s) => s.app?.update)
  if (!u?.version || !['available', 'downloading', 'ready', 'installing', 'error'].includes(u.state)) return null
  const step = nextStep(u)
  const busy = u.state === 'downloading' || u.state === 'installing'
  const label =
    u.state === 'downloading' ? `Downloading ${Math.round((u.progress ?? 0) * 100)}%` : u.state === 'installing' ? 'Installing…' : (step?.label ?? '')
  return (
    <button
      type="button"
      onClick={step?.run}
      disabled={busy || !step}
      title={u.state === 'error' ? u.error : `StreamHub ${u.version} is available`}
      className={`no-drag relative mr-1 flex h-7 items-center gap-1.5 overflow-hidden rounded-full px-3 text-small-strong text-white transition-[filter] hover:brightness-110 disabled:hover:brightness-100 ${
        u.state === 'error' ? 'bg-support-red' : 'bg-accent'
      }`}
    >
      {u.state === 'downloading' && (
        <span className="absolute inset-y-0 left-0 bg-white/20 transition-[width]" style={{ width: `${(u.progress ?? 0) * 100}%` }} />
      )}
      {busy ? <Loader2Icon className="relative size-3.5 animate-spin" /> : <CircleArrowUpIcon className="relative size-3.5" strokeWidth={2.5} />}
      <span className="relative tabular-nums">{label}</span>
    </button>
  )
}

/** Inline Markdown: **bold** and *italic* as such, links as their text. */
function inline(text: string): React.ReactNode[] {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .split(/(\*\*.+?\*\*|\*[^*]+\*)/g)
    .map((part, i) =>
      part.startsWith('**') ? (
        <strong key={i} className="font-semibold text-primary">
          {part.slice(2, -2)}
        </strong>
      ) : part.startsWith('*') && part.length > 2 ? (
        <em key={i}>{part.slice(1, -1)}</em>
      ) : (
        part
      )
    )
}

/** Release notes (CHANGELOG.md / GitHub Markdown): headings and bullet lists. */
function ReleaseNotes({ md }: { md: string }): React.JSX.Element {
  const blocks: React.ReactNode[] = []
  let list: React.ReactNode[] = []
  const flush = (): void => {
    if (list.length) blocks.push(<ul key={`l${blocks.length}`} className="flex list-disc flex-col gap-1.5 pl-4 marker:text-tertiary">{list}</ul>)
    list = []
  }
  for (const line of md.split('\n')) {
    const t = line.trim()
    if (!t) continue
    if (t.startsWith('#')) {
      flush()
      blocks.push(
        <p key={`h${blocks.length}`} className="pt-1 text-small-strong text-primary first:pt-0">
          {t.replace(/^#+\s*/, '')}
        </p>
      )
    } else if (/^[-*] /.test(t)) list.push(<li key={list.length}>{inline(t.slice(2))}</li>)
    else {
      flush()
      blocks.push(<p key={`p${blocks.length}`}>{inline(t)}</p>)
    }
  }
  flush()
  return <div className="flex flex-col gap-2 text-small text-secondary">{blocks}</div>
}

function NotesBox({ title, md, link }: { title: string; md: string; link?: { label: string; url: string } }): React.JSX.Element {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-small font-semibold tracking-wide text-tertiary uppercase">{title}</span>
        {link && (
          <button
            type="button"
            onClick={() => void window.api.openExternal(link.url)}
            className="flex items-center gap-1 text-small-strong text-accent hover:underline"
          >
            {link.label}
            <ExternalLinkIcon className="size-3" />
          </button>
        )}
      </div>
      <div className="max-h-72 overflow-y-auto rounded-card bg-well px-3 py-2.5 ring-1 ring-separator">
        <ReleaseNotes md={md} />
      </div>
    </div>
  )
}

const ago = (t?: number): string => {
  if (!t) return 'never'
  const min = Math.round((Date.now() - t) / 60_000)
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`
}

/** Settings → Updates. */
export function UpdatesSection(): React.JSX.Element {
  const app = useUi((s) => s.app)
  if (!app) return <div />
  const u = app.update
  const step = nextStep(u)
  const current = changelogSection(changelog, u.current)
  const summary =
    u.state === 'checking'
      ? 'Checking…'
      : u.state === 'latest'
        ? `You're up to date (checked ${ago(u.lastCheck)}).`
        : u.state === 'available'
          ? `StreamHub ${u.version} is available.`
          : u.state === 'downloading'
            ? `Downloading StreamHub ${u.version}… ${Math.round((u.progress ?? 0) * 100)}%`
            : u.state === 'ready'
              ? u.closesToInstall
                ? `StreamHub ${u.version} is ready. Installing closes StreamHub; start it again from your Steam library.`
                : `StreamHub ${u.version} is ready. StreamHub restarts to finish.`
              : u.state === 'installing'
                ? 'Installing…'
                : u.state === 'error'
                  ? (u.error ?? 'Something went wrong.')
                  : 'Updates come from StreamHub’s releases on GitHub.'

  return (
    <div>
      <div className="mx-4 mb-4">
        <span className="text-strong text-primary">Updates</span>
        <p className="mt-1 text-small text-tertiary">You have StreamHub {u.current}.</p>
      </div>
      <div className="flex flex-col gap-4 px-4">
        <FieldGroup>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <p className={`min-w-0 flex-1 text-regular ${u.state === 'error' ? 'text-support-red' : 'text-primary'}`}>{summary}</p>
            {step ? (
              <Button variant="accent" onClick={step.run}>
                {step.label}
              </Button>
            ) : (
              <Button onClick={() => void window.api.checkForUpdates()} disabled={['checking', 'downloading', 'installing'].includes(u.state)}>
                <RotateCwIcon className={`size-3.5 ${u.state === 'checking' ? 'animate-spin' : ''}`} />
                Check now
              </Button>
            )}
          </div>
          <Field
            label="Check for updates automatically"
            description="Looks for a new version when StreamHub opens and every few hours. Nothing downloads until you click Update."
          >
            <Switch
              checked={app.settings.checkUpdates}
              onChange={(v) => void window.api.updateSettings({ checkUpdates: v })}
              label="Check for updates automatically"
            />
          </Field>
        </FieldGroup>
        {u.version && u.notes && ['available', 'downloading', 'ready', 'error'].includes(u.state) && (
          <NotesBox title={`What's new in ${u.version}`} md={u.notes} link={u.page ? { label: 'Release page', url: u.page } : undefined} />
        )}
        {current && (
          <NotesBox
            title={`What's new in this version (${u.current})`}
            md={current}
            link={{ label: 'All versions', url: `https://github.com/${RELEASE_REPO}/blob/main/CHANGELOG.md` }}
          />
        )}
      </div>
    </div>
  )
}
