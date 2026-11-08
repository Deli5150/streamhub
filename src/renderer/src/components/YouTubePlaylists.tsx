import { useEffect, useState } from 'react'
import { CheckIcon, DownloadIcon, ListVideoIcon, Loader2Icon, RefreshCwIcon, Trash2Icon, XIcon } from 'lucide-react'
import type { YouTubePlaylistSummary } from '@shared/types'
import { errorMessage, useUi } from '../store'
import { Thumbnail } from './Thumbnail'
import { Button, Dialog, FieldGroup } from './ui'

// Settings → YouTube playlists: import playlists from the signed-in YouTube account (picked in a
// pane), then they're on Home and play like Watch Later. See main/ytPlaylists.ts.

const countText = (n?: number): string => (n === undefined ? '' : `${n} ${n === 1 ? 'video' : 'videos'}`)

/** The settings popover: the import button and the imported playlists. */
export function PlaylistsSection(): React.JSX.Element {
  const app = useUi((s) => s.app)
  const connected = Boolean(app?.accounts.find((a) => a.platform === 'youtube')?.connected)
  const playlists = app?.ytPlaylists ?? []
  const [busy, setBusy] = useState<string | null>(null)
  const run = (id: string, op: Promise<void>): void => {
    setBusy(id)
    op.catch((e) => useUi.getState().showToast({ text: errorMessage(e) })).finally(() => setBusy(null))
  }

  return (
    <div>
      <div className="mx-4 mb-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-strong text-primary">YouTube playlists</span>
          <Button variant="accent" onClick={() => useUi.getState().set({ importPlaylists: true })} disabled={!connected} data-keep-popover>
            <DownloadIcon className="size-3.5" />
            Import playlists…
          </Button>
        </div>
        <p className="mt-1 text-small text-tertiary">
          {connected
            ? 'Bring playlists from your YouTube account into StreamHub. They show on Home and play like Watch Later, and stay up to date with YouTube.'
            : 'Connect YouTube in Accounts first, then import your playlists here.'}
        </p>
      </div>
      {playlists.length > 0 && (
        <div className="px-4">
          <FieldGroup>
            {playlists.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                <div className="relative aspect-video w-16 shrink-0 overflow-hidden rounded ring-1 ring-separator">
                  <Thumbnail src={p.thumbnail} className="[&_svg]:size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-strong text-primary">{p.title}</div>
                  <div className="text-small text-tertiary">{countText(p.items.length)}</div>
                </div>
                <Button
                  variant="plain"
                  title="Get the latest videos from YouTube"
                  disabled={busy !== null}
                  onClick={() => run(p.id, window.api.refreshYouTubePlaylist(p.id))}
                >
                  <RefreshCwIcon className={`size-3.5 ${busy === p.id ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  variant="plain"
                  title="Remove from StreamHub (stays on YouTube)"
                  disabled={busy !== null}
                  onClick={() => run(p.id, window.api.removeYouTubePlaylist(p.id))}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            ))}
          </FieldGroup>
        </div>
      )}
    </div>
  )
}

/** The import pane: every playlist on the account, ticked to import, then confirmed. */
export function ImportPlaylistsDialog(): React.JSX.Element | null {
  const open = useUi((s) => s.importPlaylists)
  const imported = useUi((s) => s.app?.ytPlaylists) ?? []
  const [list, setList] = useState<YouTubePlaylistSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const close = (): void => {
    if (!importing) useUi.getState().set({ importPlaylists: false })
  }

  useEffect(() => {
    if (!open) return
    setList(null)
    setError(null)
    setPicked([])
    window.api.listYouTubePlaylists().then(setList, (e) => setError(errorMessage(e)))
  }, [open])

  if (!open) return null
  const isImported = (id: string): boolean => imported.some((p) => p.id === id)
  const choosable = (list ?? []).filter((p) => !isImported(p.id))
  const allPicked = choosable.length > 0 && choosable.every((p) => picked.includes(p.id))
  const toggle = (id: string): void => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const confirm = (): void => {
    setImporting(true)
    window.api
      .importYouTubePlaylists(picked)
      .then(() => {
        useUi.getState().set({ importPlaylists: false })
        useUi.getState().showToast({
          text: `Imported ${picked.length} ${picked.length === 1 ? 'playlist' : 'playlists'}`,
          action: { label: 'Show on Home', run: () => useUi.getState().go({ kind: 'home' }) }
        })
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setImporting(false))
  }

  return (
    <Dialog
      open
      onClose={close}
      width="w-[600px]"
      title="Import YouTube playlists"
      description="Pick the playlists to bring into StreamHub. YouTube doesn't share your Watch Later list with apps, so it isn't here."
      footer={
        <>
          <Button variant="plain" onClick={close} disabled={importing}>
            <XIcon className="size-3.5 text-secondary" />
            Cancel
          </Button>
          <Button variant="filled" onClick={confirm} disabled={picked.length === 0 || importing}>
            {importing ? <Loader2Icon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5" />}
            {importing ? 'Importing…' : picked.length ? `Import ${picked.length} ${picked.length === 1 ? 'playlist' : 'playlists'}` : 'Import'}
          </Button>
        </>
      }
    >
      {error ? (
        <p className="py-6 text-center text-regular text-support-red">{error}</p>
      ) : !list ? (
        <div className="flex items-center justify-center gap-2 py-10 text-regular text-tertiary">
          <Loader2Icon className="size-4 animate-spin" />
          Loading your playlists…
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-regular text-tertiary">
          <ListVideoIcon className="size-8" strokeWidth={1.5} />
          This YouTube account has no playlists yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2 pt-1 pb-2">
          <div className="flex items-center justify-between text-small text-tertiary">
            <span className="tabular-nums">
              {picked.length} of {choosable.length} selected
            </span>
            {choosable.length > 0 && (
              <button
                type="button"
                className="text-small-strong text-accent hover:underline"
                onClick={() => setPicked(allPicked ? [] : choosable.map((p) => p.id))}
              >
                {allPicked ? 'Select none' : 'Select all'}
              </button>
            )}
          </div>
          <ul className="grid grid-cols-2 gap-2">
            {list.map((p) => {
              const done = isImported(p.id)
              const on = done || picked.includes(p.id)
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={done || importing}
                    onClick={() => toggle(p.id)}
                    aria-pressed={on}
                    title={done ? 'Already imported' : p.title}
                    className={`flex w-full items-center gap-3 rounded-card p-2 text-left transition-colors disabled:cursor-default ${
                      on ? 'bg-accent/15 ring-1 ring-accent' : 'ring-1 ring-separator hover:bg-control-subtle'
                    } ${done ? 'opacity-60' : ''}`}
                  >
                    <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded ring-1 ring-separator">
                      <Thumbnail src={p.thumbnail} className="[&_svg]:size-5" />
                      <span
                        className={`absolute top-1 left-1 flex size-5 items-center justify-center rounded-md shadow ${on ? 'bg-accent' : 'bg-black/45 ring-1 ring-white/70'}`}
                      >
                        {on && <CheckIcon className="size-3.5 text-white" strokeWidth={3} />}
                      </span>
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-strong leading-snug text-primary">{p.title}</span>
                      <span className="text-small text-tertiary">{done ? 'Imported' : countText(p.count)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Dialog>
  )
}
