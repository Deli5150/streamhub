import { useEffect, useMemo, useState } from 'react'
import { CheckIcon, PlayIcon, StarIcon, XIcon } from 'lucide-react'
import { combinedEdits, nameMatches } from '../lib/combined'
import { useUi, type CombineRequest } from '../store'
import { ChannelRow } from './ChannelRow'
import { Button, Dialog, SearchInput } from './ui'

/** Pick channels to merge into one sidebar profile, plus which is shown (★) and which plays (▶). */
export function CombineDialog({ request, onClose }: { request: CombineRequest | null; onClose(): void }): React.JSX.Element | null {
  const app = useUi((s) => s.app)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [mainKey, setMainKey] = useState('')
  const [defaultKey, setDefaultKey] = useState('')

  useEffect(() => {
    if (!request) return
    // A new combine starts with the channel's name, so the streamer's other channels are listed.
    setSearch(request.group ? '' : (app?.channels.find((c) => c.key === request.seedKey)?.displayName ?? ''))
    setSelected(request.group ? [...request.group.memberKeys] : [request.seedKey])
    setMainKey(request.group?.mainKey ?? request.seedKey)
    setDefaultKey(request.group?.defaultKey ?? request.seedKey)
    // Only when a new request opens, not on every state update.
  }, [request])

  const rows = useMemo(() => {
    return (app?.channels ?? [])
      .filter((c) => selected.includes(c.key) || nameMatches(search, c))
      .sort((a, b) => Number(selected.includes(b.key)) - Number(selected.includes(a.key)) || a.displayName.localeCompare(b.displayName))
  }, [app, search, selected])

  if (!request || !app) return null
  const editing = Boolean(request.group)

  const toggle = (key: string): void => {
    setSelected((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((k) => k !== key)
        if (key === mainKey) setMainKey(next[0] ?? '')
        if (key === defaultKey) setDefaultKey(next[0] ?? '')
        return next
      }
      if (prev.length === 0) {
        setMainKey(key)
        setDefaultKey(key)
      }
      return [...prev, key]
    })
  }

  const confirm = (): void => {
    if (selected.length < 2) return
    const main = selected.includes(mainKey) ? mainKey : selected[0]
    const def = selected.includes(defaultKey) ? defaultKey : main
    const groups = app.settings.combined
    const combined = request.group
      ? combinedEdits.update(groups, request.group.id, selected, main, def)
      : combinedEdits.create(groups, selected, main, def)
    window.api.updateSettings({ combined })
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? 'Edit combined channel' : 'Combine channels'}
      description="Merge a streamer's channels into one sidebar profile. Pick the channels to combine, then choose which one is shown in the sidebar and which one opens to watch."
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            <XIcon className="size-3.5 text-secondary" />
            Cancel
          </Button>
          <Button variant="filled" onClick={confirm} disabled={selected.length < 2}>
            <CheckIcon className="size-3.5" />
            {editing ? 'Save' : 'Combine'} ({selected.length})
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 pt-1 pb-2">
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search channels…" autoFocus onFocus={(e) => e.currentTarget.select()} />
        <div className="flex items-center justify-between text-small text-tertiary">
          <span className="tabular-nums">{selected.length} selected</span>
          {selected.length > 0 && (
            <span className="flex items-center gap-2.5">
              <span className="flex items-center gap-1">
                <StarIcon className="size-3 fill-amber-400 text-amber-400" />
                sidebar
              </span>
              <span className="flex items-center gap-1">
                <PlayIcon className="size-3 fill-accent text-accent" />
                opens to watch
              </span>
            </span>
          )}
        </div>
        <ul className="flex flex-col">
          {rows.map((c) => {
            const isSelected = selected.includes(c.key)
            const isMain = isSelected && c.key === mainKey
            const isDefault = isSelected && c.key === defaultKey
            return (
              <li key={c.key} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggle(c.key)}
                  aria-pressed={isSelected}
                  className={`flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors ${
                    isSelected ? 'bg-accent/15 ring-1 ring-accent' : 'hover:bg-control-subtle'
                  }`}
                >
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-md transition-colors ${
                      isSelected ? 'bg-accent' : 'bg-control-subtle ring-1 ring-secondary'
                    }`}
                  >
                    {isSelected && <CheckIcon className="size-3.5 text-white" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <ChannelRow channel={c} live={app.live[c.key]} compact />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMainKey(c.key)}
                  title={isMain ? 'Shown in the sidebar' : 'Show this channel in the sidebar'}
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                    isSelected ? 'hover:bg-control-subtle' : 'pointer-events-none opacity-0'
                  }`}
                >
                  <StarIcon className={`size-4 ${isMain ? 'fill-amber-400 text-amber-400' : 'text-tertiary'}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultKey(c.key)}
                  title={isDefault ? 'Opens to watch when clicked' : 'Open this channel to watch by default'}
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                    isSelected ? 'hover:bg-control-subtle' : 'pointer-events-none opacity-0'
                  }`}
                >
                  <PlayIcon className={`size-4 ${isDefault ? 'fill-accent text-accent' : 'text-tertiary'}`} />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Dialog>
  )
}
