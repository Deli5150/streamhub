import { describe, expect, it } from 'vitest'
import { canonical, codeToKey, formatAccelerator, normalizeBindings, shortcutProblem, validateBindings } from '../src/shared/shortcuts'

const defaults = {
  toggleSidebar: ['Control+Command+S'],
  toggleChannels: ['Control+Command+C'],
  multiView: ['Control+Command+M'],
  pip: ['Control+Command+P'],
  returnHome: ['Control+Command+H'],
  toggleMenubarApp: ['Control+Command+B']
}

describe('shortcuts', () => {
  it('reads keys by physical code, including ones the old recorder ignored', () => {
    expect(['KeyS', 'Digit4', 'F13', 'Numpad7', 'NumpadAdd', 'Enter', 'Tab', 'PageDown', 'MediaPlayPause', 'Backquote'].map(codeToKey)).toEqual([
      'S', '4', 'F13', 'num7', 'numadd', 'Return', 'Tab', 'PageDown', 'MediaPlayPause', '`'
    ])
    expect(codeToKey('F25')).toBeNull()
    expect(codeToKey('Fn')).toBeNull()
  })

  it('allows ⌥, ⌃ and ⌘ combos, and bare F-keys / media keys', () => {
    for (const ok of ['Alt+S', 'Alt+Shift+Left', 'Control+Tab', 'Command+Alt+Shift+Control+K', 'F5', 'Shift+F5', 'MediaPlayPause']) expect(shortcutProblem(ok)).toBeNull()
    expect(shortcutProblem('S')).toMatch(/typing/)
    expect(shortcutProblem('Shift+S')).toMatch(/capitals/)
    expect(shortcutProblem('Space')).toMatch(/typing/)
    expect(shortcutProblem('Cmd+Q')).toMatch(/already used/)
  })

  it('compares shortcuts regardless of modifier order or aliases', () => {
    expect(canonical('Shift+Cmd+a')).toBe(canonical('Command+Shift+A'))
    expect(formatAccelerator('Shift+Alt+Control+Command+Return')).toBe('⌃⌥⇧⌘↩')
  })

  it('shows Windows key names off the Mac', () => {
    expect(formatAccelerator('Control+Command+S', false)).toBe('Win+Ctrl+S')
    expect(formatAccelerator('Shift+Alt+Control+Return', false)).toBe('Ctrl+Alt+Shift+Enter')
    expect(formatAccelerator('Alt+Escape', false)).toBe('Alt+Esc')
    expect(formatAccelerator('Control+Up', false)).toBe('Ctrl+↑')
  })

  it('migrates single-string settings and validates lists', () => {
    expect(normalizeBindings({ pip: 'Control+Command+P', multiView: ['F5', 'F5', 'Alt+M'], bogus: ['F6'] })).toEqual({
      pip: ['Control+Command+P'],
      multiView: ['F5', 'Alt+M']
    })
    expect(validateBindings({ toggleSidebar: ['F5', 'Alt+S', 'Control+Shift+Up'] }, defaults)).toBeNull()
    expect(validateBindings({ toggleSidebar: ['F5'], pip: ['F5'] }, defaults)).toMatch(/used twice/)
    expect(validateBindings({ toggleSidebar: [] }, defaults)).toBeNull()
  })

  it('accepts the Windows and Linux defaults (Ctrl+Alt)', () => {
    const ctrlAlt = Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, v.map((a) => a.replace('Control+Command', 'Control+Alt'))])) as typeof defaults
    expect(validateBindings({}, ctrlAlt)).toBeNull()
    expect(formatAccelerator('Control+Alt+C', false)).toBe('Ctrl+Alt+C')
  })
})
