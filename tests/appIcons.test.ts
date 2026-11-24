import { describe, expect, it } from 'vitest'
import { appIconFor, holidayOn, PICKABLE_ICONS } from '../src/shared/appIcons'

const day = (m: number, d: number): Date => new Date(2026, m - 1, d, 12)

describe('app icons', () => {
  it('knows the holiday windows, ends included', () => {
    expect(holidayOn(day(10, 23))).toBeNull()
    expect(holidayOn(day(10, 24))).toBe('holiday-halloween')
    expect(holidayOn(day(11, 1))).toBe('holiday-halloween')
    expect(holidayOn(day(11, 2))).toBeNull()
    expect(holidayOn(day(12, 1))).toBe('holiday-christmas')
    expect(holidayOn(day(12, 26))).toBe('holiday-christmas')
    expect(holidayOn(day(12, 27))).toBeNull()
  })

  it('shows the holiday icon over the picked one, unless holiday icons are off', () => {
    expect(appIconFor({ appIcon: 'color-ember' }, day(12, 10))).toBe('holiday-christmas')
    expect(appIconFor({ appIcon: 'color-ember', holidayIcons: false }, day(12, 10))).toBe('color-ember')
    expect(appIconFor({ appIcon: 'color-ember' }, day(6, 1))).toBe('color-ember')
    expect(appIconFor({}, day(6, 1))).toBe('default')
  })

  it("doesn't let holiday icons be picked", () => {
    expect(PICKABLE_ICONS.some((i) => i.group === 'Holidays')).toBe(false)
    expect(appIconFor({ appIcon: 'holiday-halloween' }, day(6, 1))).toBe('default')
  })
})
