import { useEffect } from 'react'
import { XIcon } from 'lucide-react'
import { useUi } from '../store'

const SHOW_MS = 4500

/** The window's toast (useUi.showToast): bottom center, gone after a few seconds or when dismissed. */
export function Toast(): React.JSX.Element | null {
  const toast = useUi((s) => s.toast)
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => useUi.setState((s) => (s.toast?.id === toast.id ? { toast: null } : s)), SHOW_MS)
    return () => clearTimeout(timer)
  }, [toast])
  if (!toast) return null
  const close = (): void => useUi.setState({ toast: null })
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
      <div
        key={toast.id}
        role="status"
        className="pointer-events-auto flex items-center gap-3 rounded-full bg-popover py-1.5 pr-1.5 pl-4 text-regular text-primary shadow-lg ring-1 ring-separator"
      >
        <span>{toast.text}</span>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.run()
              close()
            }}
            className="h-7 rounded-full bg-accent px-3 text-small-strong text-white transition-opacity hover:opacity-90"
          >
            {toast.action.label}
          </button>
        )}
        <button
          type="button"
          onClick={close}
          title="Dismiss"
          className="flex size-7 items-center justify-center rounded-full transition-colors hover:bg-control"
        >
          <XIcon className="size-3.5 text-secondary" />
        </button>
      </div>
    </div>
  )
}
