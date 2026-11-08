import { useState } from 'react'
import { CheckCircle2Icon, CloudIcon, Loader2Icon, RefreshCwIcon, TriangleAlertIcon, XCircleIcon } from 'lucide-react'
import type { AccountInfo, Platform, SyncStatus } from '@shared/types'
import { errorMessage, useUi } from '../store'
import { PLATFORM_META } from './platform'
import { Button, Field, FieldGroup } from './ui'

const HOW: Record<Platform, string> = {
  twitch: 'Sign in to twitch.tv in a window. The channels you follow are read from your Following page — no developer keys required.',
  youtube: 'Sign in with Google in your web browser (read-only access). Your subscriptions are read from YouTube, and you can return to StreamHub when the browser says you’re signed in.',
  kick: 'Sign in on kick.com in a window. Your followed channels are read from that session.',
  rumble: 'Sign in on rumble.com in a window. The channels you follow are read from that session.'
}

export function Accounts(): React.JSX.Element {
  const app = useUi((s) => s.app)
  if (!app) return <div />
  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <div>
          <h1 className="text-heading1 text-primary">Accounts</h1>
          <p className="mt-1 text-regular text-tertiary">
            Sign in to each platform once. StreamHub keeps you signed in and keeps the channels you follow in sync.
          </p>
        </div>
        <SyncCard sync={app.sync} />
        {app.accounts.map((a) => (
          <AccountCard key={a.platform} account={a} syncing={app.syncing.includes(a.platform)} count={app.channels.filter((c) => c.platform === a.platform).length} />
        ))}
      </div>
    </div>
  )
}

function AccountCard({ account: a, syncing, count }: { account: AccountInfo; syncing: boolean; count: number }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const meta = PLATFORM_META[a.platform]
  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      const msg = errorMessage(e)
      if (!/window closed/i.test(msg)) setError(msg)
    } finally {
      setBusy(false)
    }
  }
  const shownError = error ?? a.error

  return (
    <FieldGroup>
      <Field
        label={
          <span className={`flex items-center gap-2 font-semibold ${meta.accent}`}>
            <meta.Icon className="size-4" strokeWidth={2.5} />
            {meta.label}
          </span>
        }
        description={a.connected ? `${a.username && a.username !== 'Signed in' ? `Connected as ${a.username}` : 'Connected'} · ${count} ${count === 1 ? 'channel' : 'channels'}` : 'Not connected'}
      >
        {a.connected ? <CheckCircle2Icon className="size-4 text-support-green" /> : <XCircleIcon className="size-4 text-tertiary" />}
      </Field>
      <Field label={`Sign in with ${meta.label}`} description={HOW[a.platform]}>
        {a.connected ? (
          <>
            <Button variant="plain" onClick={() => run(() => window.api.refresh())} disabled={busy || syncing}>
              {syncing ? <Loader2Icon className="size-3.5 animate-spin" /> : <RefreshCwIcon className="size-3.5" />}
              {syncing ? 'Syncing…' : 'Sync following'}
            </Button>
            {a.error && (
              <Button variant="accent" onClick={() => run(() => window.api.login(a.platform))} disabled={busy}>
                Reconnect
              </Button>
            )}
            <Button variant="filled" onClick={() => run(() => window.api.logout(a.platform))} disabled={busy}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button variant="filled" onClick={() => run(() => window.api.login(a.platform))} disabled={busy}>
            <meta.Icon className="size-3.5 shrink-0" strokeWidth={2.5} />
            {busy ? 'Sign-in window open…' : `Sign in with ${meta.label}`}
          </Button>
        )}
      </Field>
      {shownError && (
        <div className="flex items-start gap-2 px-4 py-3">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-support-red" />
          <p className="text-small text-support-red">{shownError}</p>
        </div>
      )}
    </FieldGroup>
  )
}

/** How long ago, roughly ("just now", "5 min ago", "3 h ago"). */
function ago(at: number): string {
  const min = Math.round((Date.now() - at) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

/** Sync with Google: settings, follows, Watch Later and platform sign-ins on every device. */
function SyncCard({ sync }: { sync: SyncStatus }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const shownError = error ?? sync.error

  return (
    <FieldGroup>
      <Field
        label={
          <span className="flex items-center gap-2 font-semibold text-primary">
            <CloudIcon className="size-4" strokeWidth={2.5} />
            Sync with Google
          </span>
        }
        description={
          sync.signedIn
            ? `${sync.email ? `Syncing as ${sync.email}` : 'Syncing'} · ${sync.syncing ? 'syncing now…' : sync.lastSync ? `last synced ${ago(sync.lastSync)}` : 'not synced yet'}`
            : 'Keep your platform sign-ins, settings, followed channels, combined channels, muted alerts and Watch Later the same on every computer and phone with StreamHub. They’re saved in a private StreamHub folder in your Google Drive that only StreamHub can see. If a platform asks you to sign in again on another device, signing in there once fixes it.'
        }
      >
        {sync.signedIn ? (
          <>
            <Button variant="plain" onClick={() => run(() => window.api.syncNow())} disabled={busy || sync.syncing}>
              {sync.syncing ? <Loader2Icon className="size-3.5 animate-spin" /> : <RefreshCwIcon className="size-3.5" />}
              Sync now
            </Button>
            <Button variant="filled" onClick={() => run(() => window.api.syncSignOut())} disabled={busy}>
              Turn off
            </Button>
          </>
        ) : (
          <Button variant="filled" onClick={() => run(() => window.api.syncSignIn())} disabled={busy}>
            {busy ? 'Finish in your browser…' : 'Sign in with Google'}
          </Button>
        )}
      </Field>
      {shownError && (
        <div className="flex items-start gap-2 px-4 py-3">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-support-red" />
          <p className="text-small text-support-red">{shownError}</p>
        </div>
      )}
    </FieldGroup>
  )
}
