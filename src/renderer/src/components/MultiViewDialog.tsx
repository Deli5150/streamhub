import { useEffect, useMemo, useState } from 'react'
import { CheckIcon, XIcon } from 'lucide-react'
import { MAX_MULTI, useUi } from '../store'
import { ChannelRow } from './ChannelRow'
import { Button, Dialog, SearchInput } from './ui'

/** Pick up to six live channels for multi-view (opened from the header, edit mode or the shortcut). */
export function MultiViewDialog(): React.JSX.Element | null {
  const { app, multiPicker, multi, set, setMulti } = useUi()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    if (!multiPicker) return
    setSearch('')
    setSelected(multiPicker.slice(0, MAX_MULTI))
  }, [multiPicker])

  const live = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (app?.channels ?? [])
      .filter((c) => app?.live[c.key] && (!q || c.displayName.toLowerCase().includes(q) || c.platform.includes(q)))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [app, search])

  if (!multiPicker || !app) return null
  const totalLive = Object.keys(app.live).length
  const limitReached = selected.length >= MAX_MULTI
  const editing = multi.length > 0
  const close = (): void => set({ multiPicker: null })

  const toggle = (key: string): void =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev.length >= MAX_MULTI ? prev : [...prev, key]))

  return (
    <Dialog
      open
      onClose={close}
      title={editing ? 'Add or remove streams' : 'Multi-view'}
      description={`Watch up to ${MAX_MULTI} live streams at once. Only channels that are live right now are shown.`}
      footer={
        <>
          <Button variant="plain" onClick={close}>
            <XIcon className="size-3.5 text-secondary" />
            Cancel
          </Button>
          <Button
            variant="filled"
            disabled={selected.length === 0}
            onClick={() => {
              setMulti(selected)
              close()
            }}
          >
            <CheckIcon className="size-3.5" />
            {editing ? 'Update multi-view' : 'Start multi-view'} ({selected.length})
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 pt-1 pb-2">
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search channels…" autoFocus />
        <div className="flex items-center justify-between text-small">
          <span className="text-tertiary tabular-nums">
            {selected.length} / {MAX_MULTI} selected
          </span>
          {limitReached && <span className="text-amber-500">Maximum reached — deselect one to add another.</span>}
        </div>
        {live.length === 0 ? (
          <p className="py-10 text-center text-regular text-tertiary">
            {totalLive === 0 ? 'No followed channels are live right now.' : `No live channels match “${search}”.`}
          </p>
        ) : (
          <ul className="flex flex-col">
            {live.map((c) => {
              const isSelected = selected.includes(c.key)
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => toggle(c.key)}
                    disabled={!isSelected && limitReached}
                    aria-pressed={isSelected}
                    className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors disabled:opacity-40 ${
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
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Dialog>
  )
}
