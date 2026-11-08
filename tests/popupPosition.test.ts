import { describe, expect, it } from 'vitest'
import { popupPosition } from '../src/main/popupPosition'

// A 1920×1080 screen; the work area excludes the taskbar / menu bar.
const screenAt = (workArea: { x: number; y: number; width: number; height: number }) => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea })
const size = { width: 360, height: 520 }
const inside = (p: { x: number; y: number }, area: { x: number; y: number; width: number; height: number }): boolean =>
  p.x >= area.x && p.y >= area.y && p.x + size.width <= area.x + area.width && p.y + size.height <= area.y + area.height

describe('tray popup position', () => {
  it('opens above the icon in a bottom Windows taskbar (it used to open below the screen)', () => {
    const d = screenAt({ x: 0, y: 0, width: 1920, height: 1032 }) // 48px taskbar at the bottom
    const p = popupPosition(size, { x: 1700, y: 1040, width: 32, height: 32 }, d, 'win32')
    expect(p.y + size.height).toBeLessThanOrEqual(1040) // above the icon
    expect(p.x).toBe(1716 - 180) // centred on it
    expect(inside(p, d.workArea)).toBe(true)
  })

  it('opens below the icon in the macOS menu bar or a top taskbar', () => {
    const d = screenAt({ x: 0, y: 25, width: 1920, height: 1055 })
    const p = popupPosition(size, { x: 1500, y: 0, width: 24, height: 24 }, d, 'darwin')
    expect(p.y).toBeGreaterThanOrEqual(24 + 6) // below the icon
    expect(inside(p, d.workArea)).toBe(true)
  })

  it('opens beside the icon in a left or right taskbar', () => {
    const right = screenAt({ x: 0, y: 0, width: 1860, height: 1080 })
    const r = popupPosition(size, { x: 1874, y: 900, width: 32, height: 32 }, right, 'win32')
    expect(r.x + size.width).toBeLessThanOrEqual(1874)
    expect(inside(r, right.workArea)).toBe(true)
    const left = screenAt({ x: 60, y: 0, width: 1860, height: 1080 })
    const l = popupPosition(size, { x: 14, y: 900, width: 32, height: 32 }, left, 'win32')
    expect(l.x).toBeGreaterThanOrEqual(46)
    expect(inside(l, left.workArea)).toBe(true)
  })

  it('stays on screen for an icon at the very corner', () => {
    const d = screenAt({ x: 0, y: 0, width: 1920, height: 1032 })
    expect(inside(popupPosition(size, { x: 1900, y: 1040, width: 32, height: 32 }, d, 'win32'), d.workArea)).toBe(true)
  })

  it('without a tray position (keyboard shortcut) uses the corner the tray is in', () => {
    const win = screenAt({ x: 0, y: 0, width: 1920, height: 1032 })
    const w = popupPosition(size, undefined, win, 'win32')
    expect(w.y + size.height).toBe(1032 - 6) // bottom right, above the taskbar
    expect(w.x + size.width).toBe(1920 - 6)
    const mac = screenAt({ x: 0, y: 25, width: 1920, height: 1055 })
    expect(popupPosition(size, { x: 0, y: 0, width: 0, height: 0 }, mac, 'darwin')).toEqual({ x: 1920 - 6 - 360, y: 31 })
  })
})
