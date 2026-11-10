import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { SearchIcon } from 'lucide-react'

type ButtonVariant = 'filled' | 'plain' | 'accent' | 'destructive'

export function Button({
  variant = 'filled',
  size = 'small',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'small' | 'regular' }): React.JSX.Element {
  const variants: Record<ButtonVariant, string> = {
    filled: 'bg-control hover:bg-control-active text-primary',
    plain: 'hover:bg-control-subtle text-primary',
    accent: 'bg-accent hover:brightness-110 text-white',
    destructive: 'bg-control hover:bg-support-red hover:text-white text-support-red'
  }
  const sizes = size === 'small' ? 'h-7 px-2.5 text-small-strong' : 'h-8 px-3.5 text-strong'
  return (
    <button
      type="button"
      {...props}
      className={`ui-btn ui-btn-${variant} no-drag inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-40 ${sizes} ${variants[variant]} ${className}`}
    />
  )
}

export function SearchInput(props: React.InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return (
    <label className="ui-search flex h-7 items-center gap-1.5 rounded-pill bg-control-subtle px-2.5 ring-accent focus-within:ring-2">
      <SearchIcon className="size-3.5 shrink-0 text-tertiary" strokeWidth={2.25} />
      <input
        type="text"
        autoComplete="off"
        spellCheck={false}
        {...props}
        className="min-w-0 flex-1 bg-transparent text-regular text-primary outline-none placeholder:text-tertiary"
      />
    </label>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  children
}: {
  icon: ReactNode
  title: string
  description?: ReactNode
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <div className="mb-1">{icon}</div>
      <p className="text-strong text-primary">{title}</p>
      {description && <p className="max-w-xs text-regular text-tertiary">{description}</p>}
      {children && <div className="mt-2 flex gap-2">{children}</div>}
    </div>
  )
}

/** Rounded group of settings-style rows separated by hairlines. */
export function FieldGroup({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="ui-group divide-y divide-separator overflow-hidden rounded-card bg-well ring-1 ring-separator">{children}</div>
}

export function Field({
  label,
  description,
  children
}: {
  label: ReactNode
  description?: ReactNode
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="text-strong text-primary">{label}</div>
        {description && <div className="text-small text-tertiary">{description}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
    </div>
  )
}

// ---------- Context menu ----------

export interface MenuItem {
  label: string
  /** secondary text shown on the right (e.g. a platform name) */
  sublabel?: string
  icon?: ReactNode
  onSelect(): void
  disabled?: boolean
  destructive?: boolean
}

type MenuState = { x: number; y: number; items: Array<MenuItem | 'separator'> } | null

/** Right-click menu styled like the native popover menus in the Glaze app. */
export function useContextMenu(): {
  open(e: React.MouseEvent, items: Array<MenuItem | 'separator'>): void
  element: ReactNode
} {
  const [menu, setMenu] = useState<MenuState>(null)

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const element = menu && (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      className="ui-pop-in fixed z-50 min-w-52 rounded-popover bg-popover p-1 shadow-2xl ring-1 ring-separator backdrop-blur-xl"
      style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.max(8, Math.min(menu.y, window.innerHeight - menu.items.length * 28 - 16)) }}
    >
      {menu.items.map((item, i) =>
        item === 'separator' ? (
          <div key={i} className="mx-2 my-1 h-px bg-separator" />
        ) : (
          <button
            key={`${item.label}-${i}`}
            disabled={item.disabled}
            onClick={() => {
              setMenu(null)
              item.onSelect()
            }}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-regular hover:bg-accent hover:text-white disabled:opacity-40 disabled:hover:bg-transparent ${
              item.destructive ? 'text-support-red' : 'text-primary'
            } [&:hover_svg]:text-white`}
          >
            <span className="flex w-4 shrink-0 justify-center text-secondary">{item.icon}</span>
            <span className="flex-1 truncate">{item.label}</span>
            {item.sublabel && <span className="shrink-0 text-small opacity-60">{item.sublabel}</span>}
          </button>
        )
      )}
    </div>
  )

  return {
    open: (e, items) => {
      e.preventDefault()
      e.stopPropagation()
      setMenu({ x: e.clientX, y: e.clientY, items })
    },
    element
  }
}

// ---------- Form controls ----------

export function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label?: string }): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`ui-switch relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-control-active'}`}
    >
      <span
        className={`ui-switch-thumb absolute top-[2px] left-0 size-[18px] rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-[2px]'}`}
      />
    </button>
  )
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: Array<{ value: T; label: ReactNode; title?: string }>
  onChange(v: T): void
}): React.JSX.Element {
  return (
    <div className="ui-seg flex shrink-0 rounded-lg bg-control-subtle p-0.5 ring-1 ring-separator">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`ui-seg-item flex h-6 items-center gap-1 rounded-md px-2.5 text-small-strong transition-colors ${
            value === o.value ? 'bg-control-active text-primary shadow-sm' : 'text-secondary hover:text-primary'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  onChange,
  className = ''
}: {
  value: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  onChange(v: number): void
  className?: string
}): React.JSX.Element {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`ui-slider h-1 cursor-default appearance-none rounded-full disabled:opacity-40 [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:ring-1 [&::-webkit-slider-thumb]:ring-black/20 ${className}`}
      style={{ background: `linear-gradient(to right, var(--accent) ${pct}%, var(--fg-20) ${pct}%)` }}
    />
  )
}

// ---------- Dialog ----------

export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  width = 'w-[520px]'
}: {
  open: boolean
  onClose(): void
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  children: ReactNode
  width?: string
}): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="ui-fade-in no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={`ui-dialog ui-dialog-in flex max-h-[85vh] ${width} max-w-[92vw] flex-col overflow-hidden rounded-[24px] bg-popover shadow-2xl ring-1 ring-separator`}
      >
        <div className="shrink-0 px-6 pt-5 pb-3">
          <h2 className="text-large font-semibold text-primary">{title}</h2>
          {description && <p className="mt-1 text-regular text-tertiary">{description}</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-3">{children}</div>
        {footer && <div className="ui-dialog-footer flex shrink-0 justify-end gap-2 border-t border-separator px-6 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}

// ---------- Anchored popover (header quick actions) ----------

const POPOVER_WIDTH = 416

export function QuickPopover({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const r = triggerRef.current?.getBoundingClientRect()
      if (!r) return
      setPos({ top: r.bottom + 8, left: Math.max(12, Math.min(r.left, window.innerWidth - POPOVER_WIDTH - 12)) })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || contentRef.current?.contains(t)) return
      if (t instanceof Element && t.closest('[data-keep-popover]')) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`ui-icon-btn no-drag flex size-7 shrink-0 items-center justify-center rounded-md transition-colors ${
          open ? 'bg-control text-primary' : 'text-secondary hover:bg-control-subtle hover:text-primary'
        }`}
      >
        {icon}
      </button>
      {open &&
        createPortal(
          <div
            ref={contentRef}
            role="dialog"
            aria-label={label}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: POPOVER_WIDTH }}
            className="ui-popover ui-pop-in no-drag fixed z-50 max-h-[32rem] overflow-y-auto overscroll-contain rounded-popover bg-popover py-4 shadow-2xl ring-1 ring-separator"
          >
            {children}
          </div>,
          document.body
        )}
    </>
  )
}
