import type { Settings } from '@shared/types'
import { store } from '../desktop/store'

// Same settings as the desktop (src/main/settings.ts), saved in the same shape. The menu-bar and
// keyboard-shortcut settings have no phone equivalent and are kept only so the shape matches.

export const DEFAULT_SETTINGS: Settings = {
  theme: 'default',
  menubar: { enabled: false, openInBrowser: false, theme: 'default' },
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
  return { ...DEFAULT_SETTINGS, ...saved, menubar: { ...DEFAULT_SETTINGS.menubar, ...saved?.menubar } }
}

export type SettingsPatch = Partial<Omit<Settings, 'menubar'>> & { menubar?: Partial<Settings['menubar']> }

export function updateSettings(patch: SettingsPatch): Settings {
  const prev = getSettings()
  const next: Settings = { ...prev, ...patch, menubar: { ...prev.menubar, ...patch.menubar } }
  next.combined = normalizeGroups(next.combined)
  store.set('settings', next)
  return next
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
