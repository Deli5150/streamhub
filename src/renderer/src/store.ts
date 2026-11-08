import { create } from 'zustand'
import type { AppState, Channel, CombinedGroup, LiveInfo, Platform } from '@shared/types'

export type View =
  | { kind: 'home' }
  | { kind: 'channels' }
  /** `offline` shows the channel page (past videos) even while the channel is live */
  | { kind: 'watch'; key: string; offline?: boolean }
  | { kind: 'multi' }
  /** Watch Later playlist, starting at `startId` */
  | { kind: 'playlist'; startId?: string }
  /** Video queue (lib/queue.ts), in the same player as Watch Later */
  | { kind: 'queue' }
  | { kind: 'accounts' }

export interface CombineRequest {
  /** Group being edited, or null to create one. */
  group: CombinedGroup | null
  /** Channel the dialog was opened from (pre-selected when creating). */
  seedKey: string
}

interface UiState {
  app: AppState | null
  view: View
  multi: string[]
  /** Multi-view tile whose chat shows in the side panel. */
  focused: string | null
  /** Multi-view picker: open with these keys pre-selected. */
  multiPicker: string[] | null
  combine: CombineRequest | null
  /** Player URL currently playing in picture-in-picture (in-app copies are grayed out and silent). */
  pip: string | null
  collapsed: boolean
  /** Theater mode for live streams: no sidebar and no chat, just the player. */
  theater: boolean
  /** Big Picture mode (components/bigpicture): the full-screen, controller-driven interface. */
  bigPicture: boolean
  filter: Platform | 'all'
  search: string
  setApp(s: AppState): void
  go(v: View): void
  addToMulti(key: string): void
  removeFromMulti(key: string): void
  setMulti(keys: string[]): void
  reorderMulti(sourceKey: string, targetKey: string): void
  focus(key: string): void
  set(p: Partial<Pick<UiState, 'collapsed' | 'theater' | 'bigPicture' | 'filter' | 'search' | 'multiPicker' | 'combine' | 'pip'>>): void
}

export const MAX_MULTI = 6

/**
 * Sidebar state implied by navigating to a view: Home opens it back up, Channels minimizes it (the
 * page already lists every channel), and Multi-view keeps it minimized while streams are playing.
 * Other views leave it as is.
 */
function sidebarFor(view: View, multiCount: number): { collapsed: boolean } | Record<string, never> {
  if (view.kind === 'home') return { collapsed: false }
  if (view.kind === 'channels') return { collapsed: true }
  if (view.kind === 'multi' && multiCount > 0) return { collapsed: true }
  if (view.kind === 'playlist' || view.kind === 'queue') return { collapsed: true }
  return {}
}

function persistCollapsed<T extends { collapsed?: boolean; theater?: boolean }>(patch: T): T {
  if (patch.collapsed !== undefined) localStorage.setItem('collapsed', patch.collapsed ? '1' : '0')
  if (patch.theater !== undefined) localStorage.setItem('theater', patch.theater ? '1' : '0')
  return patch
}

export const useUi = create<UiState>((set) => ({
  app: null,
  view: { kind: 'home' },
  multi: [],
  focused: null,
  multiPicker: null,
  combine: null,
  pip: null,
  collapsed: localStorage.getItem('collapsed') === '1',
  theater: localStorage.getItem('theater') === '1',
  bigPicture: false,
  filter: 'all',
  search: '',
  setApp: (app) => set({ app }),
  go: (view) => set((s) => ({ view, ...persistCollapsed(sidebarFor(view, s.multi.length)) })),
  addToMulti: (key) =>
    set((s) => {
      const multi = s.multi.includes(key) ? s.multi : [...s.multi, key].slice(-MAX_MULTI)
      const view: View = { kind: 'multi' }
      return { multi, focused: s.focused && multi.includes(s.focused) ? s.focused : key, view, ...persistCollapsed(sidebarFor(view, multi.length)) }
    }),
  removeFromMulti: (key) =>
    set((s) => {
      const multi = s.multi.filter((k) => k !== key)
      return { multi, focused: s.focused === key ? (multi[0] ?? null) : s.focused }
    }),
  setMulti: (keys) =>
    set((s) => {
      const multi = keys.slice(0, MAX_MULTI)
      const view: View = { kind: 'multi' }
      return {
        multi,
        focused: s.focused && multi.includes(s.focused) ? s.focused : (multi[0] ?? null),
        view,
        ...persistCollapsed(sidebarFor(view, multi.length))
      }
    }),
  reorderMulti: (sourceKey, targetKey) =>
    set((s) => {
      const multi = [...s.multi]
      const from = multi.indexOf(sourceKey)
      const to = multi.indexOf(targetKey)
      if (from < 0 || to < 0) return {}
      multi.splice(to, 0, multi.splice(from, 1)[0])
      return { multi }
    }),
  focus: (focused) => set({ focused }),
  set: (p) => set(persistCollapsed(p))
}))

export function useChannel(key: string | null | undefined): { channel?: Channel; live?: LiveInfo } {
  const app = useUi((s) => s.app)
  if (!key || !app) return {}
  return { channel: app.channels.find((c) => c.key === key), live: app.live[key] }
}

/** Strips Electron's "Error invoking remote method 'x': Error:" prefix. */
export const errorMessage = (e: unknown): string =>
  String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export const formatViewers = (n?: number): string =>
  n === undefined ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n)

/** Applies the OS accent color (as the Glaze app does) and marks windows without vibrancy as opaque. */
export async function applySystemAppearance(): Promise<void> {
  if (window.api.platform !== 'darwin') document.documentElement.setAttribute('data-opaque', '')
  const accent = await window.api.getAccentColor().catch(() => null)
  if (accent) document.documentElement.style.setProperty('--system-accent', accent)
}

export function uptime(startedAt?: string): string {
  if (!startedAt) return ''
  const mins = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 60_000))
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
}
