import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import type { MediaItem } from '@shared/types'

// Big Picture mode (components/bigpicture): a full-screen TV-style interface driven by a game
// controller (or the arrow keys). This file holds its navigation:
//
// - Screens: a stack of routes over the tabbed home (Live, Following, Watch Later, Queue). Going back
//   pops one and puts focus back on what was focused before.
// - Input: the Gamepad API (polled every frame, with key-repeat for held directions) and the
//   keyboard, turned into actions. Screens can take actions first (useBpInput); otherwise the
//   directions move focus and A presses the focused element.
// - Focus: every navigable element carries `data-bp` (and a stable `data-bp-id` when it should be
//   refocused on return). Moving picks the nearest element in that direction on screen, within the
//   topmost `data-bp-scope` (a dialog or the player's controls).

export type BpTab = 'live' | 'following' | 'watchLater' | 'queue' | 'search'

export type BpRoute =
  | { kind: 'home' }
  | { kind: 'channel'; key: string }
  /** A live stream (and its combined channel's other members). */
  | { kind: 'live'; key: string }
  | { kind: 'vod'; key: string; media: MediaItem }
  /** Watch Later or the queue, from `index`, moving on to the next item when one ends. */
  | { kind: 'list'; source: 'watchLater' | 'queue'; index: number }

type Entry = BpRoute & { focusId?: string }

export type BpAction = 'up' | 'down' | 'left' | 'right' | 'select' | 'back' | 'x' | 'y' | 'lb' | 'rb' | 'lt' | 'rt' | 'start'

/** Button labels to show: Xbox-style letters, or PlayStation shapes for a PlayStation controller. */
export type PadStyle = 'xbox' | 'playstation'

interface BpState {
  tab: BpTab
  stack: Entry[]
  pad: PadStyle | null
  /** Whether the last input came from a controller (or keys) rather than the mouse: hides the pointer. */
  padActive: boolean
  setTab(tab: BpTab): void
  push(route: BpRoute): void
  pop(): void
  replace(route: BpRoute): void
}

const focusedId = (): string | undefined => (document.activeElement as HTMLElement | null)?.dataset?.bpId

export const useBp = create<BpState>((set) => ({
  tab: 'live',
  stack: [{ kind: 'home' }],
  pad: null,
  padActive: false,
  setTab: (tab) => set({ tab }),
  push: (route) =>
    set((s) => {
      const stack = [...s.stack]
      stack[stack.length - 1] = { ...stack[stack.length - 1], focusId: focusedId() }
      return { stack: [...stack, route] }
    }),
  pop: () => set((s) => (s.stack.length > 1 ? { stack: s.stack.slice(0, -1) } : {})),
  replace: (route) => set((s) => ({ stack: [...s.stack.slice(0, -1), route] }))
}))

export const resetBp = (): void => useBp.setState({ tab: 'live', stack: [{ kind: 'home' }] })

// ---------- Actions ----------

/** Where an action came from: a controller, or the keyboard. */
export type BpSource = 'pad' | 'key'
type Handler = (action: BpAction, source: BpSource) => boolean
const handlers: Array<{ current: Handler }> = []
const fallbacks: Array<{ current: Handler }> = []

/**
 * Lets a screen handle actions before the default focus movement: return true to consume one.
 * The most recently mounted handler goes first. `fallback` handlers (the shell's) only get what
 * every other handler passed on, whatever the mount order.
 */
export function useBpInput(handler: Handler, { fallback = false }: { fallback?: boolean } = {}): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const list = fallback ? fallbacks : handlers
    list.push(ref)
    return () => {
      list.splice(list.indexOf(ref), 1)
    }
  }, [fallback])
}

export function dispatch(action: BpAction, source: BpSource = 'key'): void {
  for (const list of [handlers, fallbacks]) for (let i = list.length - 1; i >= 0; i--) if (list[i].current(action, source)) return
  if (action === 'up' || action === 'down' || action === 'left' || action === 'right') moveFocus(action)
  else if (action === 'select') {
    const el = document.activeElement as HTMLElement | null
    if (el?.matches('[data-bp]')) el.click()
    else focusFirst()
  }
}

// ---------- Focus ----------

function scope(): ParentNode {
  const scopes = document.querySelectorAll('[data-bp-scope]')
  return scopes[scopes.length - 1] ?? document
}

const shown = (el: HTMLElement): boolean => el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]')

export const focusables = (): HTMLElement[] => [...scope().querySelectorAll<HTMLElement>('[data-bp]')].filter(shown)

export function focusEl(el: HTMLElement | null | undefined): void {
  if (!el) return
  el.focus({ preventScroll: true })
  // Things at the top of a screen (the header, a channel's banner) bring the whole page back to the
  // top, so moving up past the last row shows them again.
  if (el.closest('[data-bp-top]')) for (const s of document.querySelectorAll('[data-bp-scroller]')) s.scrollTo({ top: 0, behavior: 'smooth' })
  else reveal(el)
}

/** Room left around a revealed element (its focus ring, and a bit of what's next). */
const REVEAL_MARGIN = 32

/**
 * Scrolls a sideways row (`data-bp-row`) and the page (`data-bp-scroller`) just enough to show the
 * element whole. Done by hand: a smooth scrollIntoView doesn't reliably scroll both at once, which on
 * short screens (a Steam Deck's 800px) left the bottom row half hidden.
 */
function reveal(el: HTMLElement): void {
  const r = el.getBoundingClientRect()
  const row = el.parentElement?.closest<HTMLElement>('[data-bp-row]')
  if (row) {
    const b = row.getBoundingClientRect()
    const dx = r.right > b.right - REVEAL_MARGIN ? r.right - b.right + REVEAL_MARGIN * 2 : r.left < b.left + REVEAL_MARGIN ? r.left - b.left - REVEAL_MARGIN * 2 : 0
    if (dx) row.scrollBy({ left: dx, behavior: 'smooth' })
  }
  const page = el.closest<HTMLElement>('[data-bp-scroller]')
  if (!page) return el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  const b = page.getBoundingClientRect()
  // A row's title sits just above its tiles: keep it in view too when moving up into the row (not
  // for grids, whose title can be far above).
  const sectionTop = el.closest('section')?.getBoundingClientRect().top ?? r.top
  const top = r.top - sectionTop < 120 ? sectionTop : r.top
  const dy = r.bottom > b.bottom - REVEAL_MARGIN ? r.bottom - b.bottom + REVEAL_MARGIN : top < b.top + REVEAL_MARGIN ? top - b.top - REVEAL_MARGIN : 0
  if (dy) page.scrollBy({ top: dy, behavior: 'smooth' })
}

/** Focuses the element marked `data-bp-autofocus` in the current scope, else the first one. */
export function focusFirst(): void {
  const all = focusables()
  focusEl(all.find((el) => el.hasAttribute('data-bp-autofocus')) ?? all[0])
}

/** Focuses the element with this `data-bp-id` if it's on screen; returns whether it was. */
export function focusId(id: string | undefined): boolean {
  if (!id) return false
  const el = focusables().find((e) => e.dataset.bpId === id)
  focusEl(el)
  return Boolean(el)
}

/**
 * Moves focus to the nearest element in a direction: among those whose center lies that way, the
 * one closest along the direction, strongly preferring ones that line up with the current one (same
 * row when moving sideways, overlapping columns when moving up or down).
 */
export function moveFocus(dir: 'up' | 'down' | 'left' | 'right'): void {
  const all = focusables()
  const cur = document.activeElement as HTMLElement | null
  if (!cur || !all.includes(cur)) return focusFirst()
  const a = cur.getBoundingClientRect()
  const horizontal = dir === 'left' || dir === 'right'
  const sign = dir === 'right' || dir === 'down' ? 1 : -1
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of all) {
    if (el === cur) continue
    const b = el.getBoundingClientRect()
    const along = horizontal ? (b.left + b.width / 2 - (a.left + a.width / 2)) * sign : (b.top + b.height / 2 - (a.top + a.height / 2)) * sign
    if (along <= 4) continue
    // Gap between the two along the other axis (0 when they overlap).
    const across = horizontal ? Math.max(0, b.top - a.bottom, a.top - b.bottom) : Math.max(0, b.left - a.right, a.left - b.right)
    const offset = horizontal ? Math.abs(b.top + b.height / 2 - (a.top + a.height / 2)) : Math.abs(b.left + b.width / 2 - (a.left + a.width / 2))
    const score = along + across * 4 + offset * 0.3
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  focusEl(best)
}

// ---------- Controller and keyboard ----------

/** Standard-mapping button index → action (A, B, X, Y, LB, RB, LT, RT, Back, Start, d-pad). */
const BUTTONS: Array<[number, BpAction]> = [
  [0, 'select'],
  [1, 'back'],
  [2, 'x'],
  [3, 'y'],
  [4, 'lb'],
  [5, 'rb'],
  [6, 'lt'],
  [7, 'rt'],
  [8, 'back'],
  [9, 'start'],
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right']
]
const REPEATS = new Set<BpAction>(['up', 'down', 'left', 'right', 'lt', 'rt'])
const REPEAT_AFTER_MS = 380
const REPEAT_EVERY_MS = 110
const STICK = 0.55

const padStyle = (id: string): PadStyle => (/054c|playstation|dualsense|dualshock|wireless controller/i.test(id) ? 'playstation' : 'xbox')

/** Reads controllers every frame and dispatches their actions (with repeat for held directions). */
function startGamepads(): () => void {
  const held = new Map<BpAction, { since: number; last: number }>()
  let frame = 0
  const tick = (): void => {
    frame = requestAnimationFrame(tick)
    const pads = [...navigator.getGamepads()].filter((p): p is Gamepad => Boolean(p?.connected))
    const pressed = new Set<BpAction>()
    for (const pad of pads) {
      for (const [i, action] of BUTTONS) if (pad.buttons[i]?.pressed) pressed.add(action)
      const [x = 0, y = 0] = pad.axes
      if (x > STICK) pressed.add('right')
      if (x < -STICK) pressed.add('left')
      if (y > STICK) pressed.add('down')
      if (y < -STICK) pressed.add('up')
    }
    // Only while StreamHub is the app in front.
    if (!document.hasFocus()) pressed.clear()
    const now = performance.now()
    for (const action of pressed) {
      const h = held.get(action)
      if (!h) {
        held.set(action, { since: now, last: now })
        fire(action, pads[0])
      } else if (REPEATS.has(action) && now - h.since > REPEAT_AFTER_MS && now - h.last > REPEAT_EVERY_MS) {
        h.last = now
        fire(action, pads[0])
      }
    }
    for (const action of [...held.keys()]) if (!pressed.has(action)) held.delete(action)
  }
  const fire = (action: BpAction, pad?: Gamepad): void => {
    const style = pad ? padStyle(pad.id) : null
    if (useBp.getState().pad !== style || !useBp.getState().padActive) useBp.setState({ pad: style, padActive: true })
    dispatch(action, 'pad')
  }
  frame = requestAnimationFrame(tick)
  const onConnect = (e: GamepadEvent): void => useBp.setState({ pad: padStyle(e.gamepad.id) })
  window.addEventListener('gamepadconnected', onConnect)
  return () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('gamepadconnected', onConnect)
  }
}

const KEYS: Record<string, BpAction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'select',
  ' ': 'select',
  Escape: 'back',
  Backspace: 'back',
  q: 'lb',
  e: 'rb',
  x: 'x',
  y: 'y'
}

/** Starts reading the controller, keyboard and mouse for Big Picture mode; returns the stop function. */
export function startBpInput(): () => void {
  const stopPads = startGamepads()
  const onKey = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    // Typing in a text field (search): only Up/Down, Enter and Esc navigate; everything else types.
    const typing = (e.target as HTMLElement | null)?.matches?.('input, textarea')
    if (typing && !['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) return
    const action = KEYS[e.key]
    if (!action) return
    e.preventDefault()
    if (!useBp.getState().padActive) useBp.setState({ padActive: true })
    dispatch(action)
  }
  // The pointer focuses what it's over, so mouse and controller can be mixed. Only when it really
  // moves: Chromium also sends mousemove when the page changes under a still pointer (controls
  // appearing), which would steal focus from the controller.
  let last = { x: NaN, y: NaN }
  const onMove = (e: MouseEvent): void => {
    if (e.screenX === last.x && e.screenY === last.y) return
    const first = Number.isNaN(last.x)
    last = { x: e.screenX, y: e.screenY }
    if (first) return
    if (useBp.getState().padActive) useBp.setState({ padActive: false })
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-bp]')
    if (el && el !== document.activeElement && focusables().includes(el)) el.focus({ preventScroll: true })
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('mousemove', onMove)
  return () => {
    stopPads()
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('mousemove', onMove)
  }
}
