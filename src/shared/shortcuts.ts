import { SHORTCUT_ACTIONS, type ShortcutAction } from './types'

// Keyboard shortcut rules shared by the recorder (renderer) and the validator (main process).
// Bindings are Electron accelerators ("Control+Command+S"); each action can have any number.

export type ShortcutBindings = Partial<Record<ShortcutAction, string[]>>

/** Most bindings any one action keeps. */
export const MAX_BINDINGS_PER_ACTION = 20

/**
 * Whether shortcuts are shown with Mac keys (⌃⌥⇧⌘) or Windows/Linux ones (Ctrl, Alt, Shift, and
 * Win or Super). The main process has `process`; the renderer (no Node) goes by the browser's platform.
 */
const nodePlatform = (globalThis as { process?: { platform?: string } }).process?.platform
const IS_MAC = nodePlatform ? nodePlatform === 'darwin' : /^Mac/.test(globalThis.navigator?.platform ?? '')
const IS_LINUX = nodePlatform ? nodePlatform === 'linux' : /Linux/.test(globalThis.navigator?.platform ?? '')
/** What Linux and Windows call the key Electron names "Command". */
const SUPER_NAME = IS_LINUX ? 'Super' : 'Win'
const OS_NAME = IS_MAC ? 'macOS' : IS_LINUX ? 'your desktop' : 'Windows'

/** The modifiers as this computer's keyboard names them, for messages. */
export const MODIFIER_HINT = IS_MAC ? '⌘, ⌃ or ⌥' : `Ctrl, Alt or ${SUPER_NAME}`
export const SHIFT_NAME = IS_MAC ? '⇧' : 'Shift'

/** macOS order (⌃⌥⇧⌘), which is also how the defaults are written. */
const MODIFIERS = ['Control', 'Alt', 'Shift', 'Command'] as const

/** Keys that work on their own: they never type text or move around a page. */
const STANDALONE_KEY = /^(F([1-9]|1\d|2[0-4])|MediaPlayPause|MediaNextTrack|MediaPreviousTrack|MediaStop|VolumeUp|VolumeDown|VolumeMute)$/

/** Shortcuts the app's own menus (and macOS) already use. */
const RESERVED = new Set(
  ['Command+Q', 'Command+W', 'Command+H', 'Command+M', 'Command+C', 'Command+V', 'Command+X', 'Command+A', 'Command+Z', 'Command+Shift+Z', 'Command+R', 'Command+Shift+R', 'Command+Alt+I', 'Command+,', 'Command+Tab', 'Command+Space', 'Control+Command+F', 'Command+Alt+H', 'Command+Alt+Escape'].map(
    (a) => canonical(a)
  )
)

/** KeyboardEvent.code → accelerator key. `code` is layout-independent and unaffected by ⌥/⇧. */
const CODE_KEYS: Record<string, string> = {
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Return',
  NumpadEnter: 'Enter',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Escape',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec',
  MediaPlayPause: 'MediaPlayPause',
  MediaTrackNext: 'MediaNextTrack',
  MediaTrackPrevious: 'MediaPreviousTrack',
  MediaStop: 'MediaStop',
  AudioVolumeUp: 'VolumeUp',
  AudioVolumeDown: 'VolumeDown',
  AudioVolumeMute: 'VolumeMute'
}

export function codeToKey(code: string): string | null {
  const m = code.match(/^Key([A-Z])$|^Digit(\d)$|^Numpad(\d)$|^(F\d{1,2})$/)
  if (m) return m[1] ?? m[2] ?? (m[3] !== undefined ? `num${m[3]}` : STANDALONE_KEY.test(m[4]) ? m[4] : null)
  return CODE_KEYS[code] ?? null
}

/** Same modifiers and key in a fixed order, so equal shortcuts compare equal. */
export function canonical(accel: string): string {
  const parts = accel.split('+').filter(Boolean)
  // "+" itself is spelled "Plus", so a trailing empty part can't occur in valid input.
  const key = parts.filter((p) => !MODIFIERS.includes(alias(p) as (typeof MODIFIERS)[number])).pop() ?? ''
  const mods = MODIFIERS.filter((m) => parts.some((p) => alias(p) === m))
  return [...mods, key.length === 1 ? key.toUpperCase() : key].join('+')
}

function alias(part: string): string {
  const a: Record<string, string> = { Cmd: 'Command', CommandOrControl: 'Command', CmdOrCtrl: 'Command', Ctrl: 'Control', Option: 'Alt', AltGr: 'Alt' }
  return a[part] ?? part
}

/** Why a single shortcut can't be used, or null if it's fine. */
export function shortcutProblem(accel: string): string | null {
  const parts = canonical(accel).split('+')
  const key = parts[parts.length - 1]
  const mods = parts.slice(0, -1)
  if (!key) return 'Press a key along with any modifiers.'
  if (mods.length === 0 && !STANDALONE_KEY.test(key)) return `Add ${MODIFIER_HINT} — on its own this key would stop you from typing in chat.`
  if (mods.length === 1 && mods[0] === 'Shift' && !STANDALONE_KEY.test(key)) return `Add ${MODIFIER_HINT} — ${SHIFT_NAME} alone would stop you from typing capitals in chat.`
  if (RESERVED.has(canonical(accel))) return `That shortcut is already used by the app or ${OS_NAME}.`
  return null
}

/** Cleans a binding map: valid, de-duplicated, capped; drops unknown actions. */
export function normalizeBindings(raw: unknown): ShortcutBindings {
  const out: ShortcutBindings = {}
  if (!raw || typeof raw !== 'object') return out
  for (const action of SHORTCUT_ACTIONS) {
    const v = (raw as Record<string, unknown>)[action]
    // Older settings stored a single string per action.
    const list = typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null
    if (list) out[action] = [...new Set(list.map(canonical))].slice(0, MAX_BINDINGS_PER_ACTION)
  }
  return out
}

/** Validates a full binding map: every shortcut usable, and none used twice. */
export function validateBindings(bindings: ShortcutBindings, defaults: Record<ShortcutAction, string[]>): string | null {
  const seen = new Set<string>()
  for (const action of SHORTCUT_ACTIONS) {
    for (const accel of (bindings[action] ?? defaults[action]).map(canonical)) {
      const problem = shortcutProblem(accel)
      if (problem) return `${formatAccelerator(accel)}: ${problem}`
      if (seen.has(accel)) return `${formatAccelerator(accel)} is used twice.`
      seen.add(accel)
    }
  }
  return null
}

const KEY_GLYPHS: Record<string, string> = {
  Return: '↩',
  Enter: '⌤',
  Tab: '⇥',
  Backspace: '⌫',
  Delete: '⌦',
  Escape: '⎋',
  Space: 'Space',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  PageUp: '⇞',
  PageDown: '⇟',
  Home: '↖',
  End: '↘',
  numadd: 'Num +',
  numsub: 'Num −',
  nummult: 'Num ×',
  numdiv: 'Num ÷',
  numdec: 'Num .',
  MediaPlayPause: '⏯',
  MediaNextTrack: '⏭',
  MediaPreviousTrack: '⏮',
  MediaStop: '⏹',
  VolumeUp: '🔊',
  VolumeDown: '🔉',
  VolumeMute: '🔇',
  Plus: '+'
}

/** Windows/Linux names for keys the Mac shows as symbols. */
const PC_KEY_NAMES: Record<string, string> = {
  Return: 'Enter',
  Enter: 'Num Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Del',
  Escape: 'Esc',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Home: 'Home',
  End: 'End'
}

/** Accelerator → the keyboard's own labels: macOS glyphs (⌃⌥⇧⌘S), or Windows names (Win+Ctrl+S). */
export function formatAccelerator(accel: string, mac = IS_MAC): string {
  const parts = canonical(accel).split('+')
  const key = parts.pop() ?? ''
  const label = (!mac && PC_KEY_NAMES[key]) || KEY_GLYPHS[key] || (/^num\d$/.test(key) ? `Num ${key.slice(3)}` : key)
  if (mac) {
    const glyph: Record<string, string> = { Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘' }
    return ['Control', 'Alt', 'Shift', 'Command'].filter((m) => parts.includes(m)).map((m) => glyph[m]).join('') + label
  }
  // Electron's "Command" is the Windows key there (Super on Linux).
  const name: Record<string, string> = { Command: SUPER_NAME, Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift' }
  return [...['Command', 'Control', 'Alt', 'Shift'].filter((m) => parts.includes(m)).map((m) => name[m]), label].join('+')
}
