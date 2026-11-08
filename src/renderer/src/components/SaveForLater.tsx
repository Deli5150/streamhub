import { BookmarkCheckIcon, BookmarkIcon } from 'lucide-react'
import { useIsSaved, type NewSavedItem } from '../lib/watchLater'
import { Button } from './ui'

/**
 * Toggles an item in the Watch Later playlist on the home page. `overlay` is the round icon used in
 * the hover controls over a player; otherwise it's a toolbar button.
 */
export function SaveForLaterButton({ item, overlay = false }: { item: NewSavedItem; overlay?: boolean }): React.JSX.Element {
  const saved = useIsSaved(item.id)
  const Icon = saved ? BookmarkCheckIcon : BookmarkIcon
  const title = saved ? 'Saved — click to remove from Watch Later' : 'Save to your Watch Later playlist on the home page'
  const toggle = (): void => void window.api.toggleSaved(item)
  if (overlay) {
    return (
      <button
        type="button"
        onClick={toggle}
        title={title}
        aria-label={saved ? 'Remove from Watch Later' : 'Save for later'}
        className={`flex size-9 items-center justify-center rounded-full text-white ring-1 ring-white/10 backdrop-blur-md transition-colors ${
          saved ? 'bg-accent/85 hover:bg-accent' : 'bg-black/55 hover:bg-black/75'
        }`}
      >
        <Icon className="size-4 shrink-0" strokeWidth={2.25} />
      </button>
    )
  }
  return (
    <Button variant={saved ? 'accent' : 'filled'} onClick={toggle} title={title}>
      <Icon className="size-3.5" strokeWidth={2.25} />
      {saved ? 'Saved' : 'Save for Later'}
    </Button>
  )
}
