import { codeToKey, TRAY } from '@shared/shortcuts'
import type { ShortcutAction } from '@shared/types'

export const SHORTCUT_META: Array<{ action: ShortcutAction; label: string; description: string }> = [
  { action: 'toggleSidebar', label: 'Toggle sidebar', description: 'Show or hide the channel sidebar.' },
  { action: 'toggleChannels', label: 'Channels panel', description: 'Slide the panel with every channel you follow (and its search) in or out, from anywhere in StreamHub.' },
  { action: 'multiView', label: 'Start multi-view', description: 'Open the multi-view picker (with the stream you are watching pre-selected).' },
  { action: 'pip', label: 'Picture-in-picture', description: 'Pop the current stream into a floating window.' },
  { action: 'returnHome', label: 'Return home', description: 'Jump back to the home screen.' },
  {
    action: 'toggleMenubarApp',
    label: `Toggle ${TRAY.name} app`,
    description: `Show or hide the ${TRAY.name} popup — works even when StreamHub isn't focused. Requires the ${TRAY.name} app to be enabled.`
  }
]

export { formatAccelerator, MODIFIER_HINT, SHIFT_NAME } from '@shared/shortcuts'

const MODIFIER_KEYS = ['Meta', 'Control', 'Alt', 'Shift', 'CapsLock', 'Fn', 'FnLock']

export const isModifierKey = (e: KeyboardEvent): boolean => MODIFIER_KEYS.includes(e.key)

/** Keydown → Electron accelerator ("Control+Alt+F5"), or null for keys that can't be bound. */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  const key = codeToKey(e.code)
  if (!key) return null
  return [e.metaKey && 'Command', e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', key].filter(Boolean).join('+')
}
