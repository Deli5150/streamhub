import { nativeTheme } from 'electron'
import { normalizeBindings, validateBindings, type ShortcutBindings } from '@shared/shortcuts'
import type { Settings, ShortcutAction } from '@shared/types'
import { getTheme } from '@shared/themes'
import { store } from './store'

/**
 * ⌃⌘ combos on macOS, so none clash with common single-⌘ system shortcuts; Ctrl+Alt on Windows and
 * Linux, where Ctrl+Win (or Ctrl+Super) combos belong to the system (Win+Ctrl+C is Windows' color
 * filter, Win+Ctrl+D a new desktop). Only shortcuts the user changed are saved, so these follow along.
 */
const DEFAULT_MODIFIERS = process.platform === 'darwin' ? 'Control+Command' : 'Control+Alt'
export const SHORTCUT_DEFAULTS: Record<ShortcutAction, string[]> = {
  toggleSidebar: [`${DEFAULT_MODIFIERS}+S`],
  toggleChannels: [`${DEFAULT_MODIFIERS}+C`],
  multiView: [`${DEFAULT_MODIFIERS}+M`],
  pip: [`${DEFAULT_MODIFIERS}+P`],
  returnHome: [`${DEFAULT_MODIFIERS}+H`],
  toggleMenubarApp: [`${DEFAULT_MODIFIERS}+B`]
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'default',
  menubar: { enabled: true, openInBrowser: false, theme: 'default' },
  notifyLive: true,
  blockTwitchAds: true,
  pipOnMinimize: false,
  bigPictureOnStartup: false,
  checkUpdates: true,
  shortcuts: {},
  combined: []
}

export function getSettings(): Settings {
  const saved = store.get('settings')
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    menubar: { ...DEFAULT_SETTINGS.menubar, ...saved?.menubar },
    shortcuts: normalizeBindings(saved?.shortcuts)
  }
}

/** Every shortcut bound to an action (the default unless the user changed it). */
export const shortcutsFor = (action: ShortcutAction): string[] => getSettings().shortcuts[action] ?? SHORTCUT_DEFAULTS[action]

type Listener = (next: Settings, prev: Settings) => void
const listeners: Listener[] = []
export const onSettingsChange = (fn: Listener): void => void listeners.push(fn)

export function updateSettings(patch: Partial<Omit<Settings, 'menubar'>> & { menubar?: Partial<Settings['menubar']> }): void {
  const prev = getSettings()
  const next: Settings = { ...prev, ...patch, menubar: { ...prev.menubar, ...patch.menubar } }
  next.combined = normalizeGroups(next.combined)
  store.set('settings', next)
  for (const fn of listeners) fn(next, prev)
}

/** Drops broken groups (fewer than 2 members) and keeps main/default keys pointing at members. */
function normalizeGroups(groups: Settings['combined']): Settings['combined'] {
  return groups
    .map((g) => {
      const memberKeys = [...new Set(g.memberKeys)]
      const mainKey = memberKeys.includes(g.mainKey) ? g.mainKey : memberKeys[0]
      return { ...g, memberKeys, mainKey, defaultKey: memberKeys.includes(g.defaultKey) ? g.defaultKey : mainKey }
    })
    .filter((g) => g.memberKeys.length >= 2)
}

/** Checks a binding map before it's saved; returns why it can't be, or null. */
export const validateShortcuts = (bindings: ShortcutBindings): string | null => validateBindings(bindings, SHORTCUT_DEFAULTS)

/** Match the native window material to the colorway's appearance. */
export function applyNativeTheme(themeId: string): void {
  nativeTheme.themeSource = getTheme(themeId)?.appearance ?? 'system'
}
