import ICONS_JSON from '../../mobile/assets/app-icons/icons.json'

// Alternate app icons (Customization → App Icon on desktop, Settings → App Icon on phones). The
// pictures are drawn by the icon generator (scripts/app-icons) into resources/app-icons (desktop
// dock and window), src/renderer/src/assets/app-icons (thumbnails) and mobile/assets/app-icons
// (phones; plugins/withAppIcons.js puts them in the native app). "default" is the normal icon.

export type AppIconGroup = 'Colours' | 'Art Styles' | 'Holidays'
export interface AppIconInfo {
  id: string
  name: string
  group: AppIconGroup
}

export const APP_ICONS: AppIconInfo[] = [{ id: 'default', name: 'StreamHub', group: 'Colours' }, ...(ICONS_JSON as AppIconInfo[])]
/** The icons you can pick. The holiday ones aren't among them: they only show on their dates. */
export const PICKABLE_ICONS = APP_ICONS.filter((i) => i.group !== 'Holidays')

/** Holiday icons switch on by themselves between these dates (month, day; inclusive). */
export const HOLIDAYS: Array<{ id: string; from: [number, number]; to: [number, number] }> = [
  { id: 'holiday-halloween', from: [10, 24], to: [11, 1] },
  { id: 'holiday-christmas', from: [12, 1], to: [12, 26] }
]

/** The holiday whose dates include `now`, if any. */
export function holidayOn(now: Date): string | null {
  const d = (now.getMonth() + 1) * 100 + now.getDate()
  return HOLIDAYS.find((h) => d >= h.from[0] * 100 + h.from[1] && d <= h.to[0] * 100 + h.to[1])?.id ?? null
}

/** The icon to show: a holiday's while it lasts (unless turned off), otherwise the one picked. */
export function appIconFor(s: { appIcon?: string; holidayIcons?: boolean }, now = new Date()): string {
  const picked = PICKABLE_ICONS.some((i) => i.id === s.appIcon) ? s.appIcon! : 'default'
  return (s.holidayIcons !== false && holidayOn(now)) || picked
}

/** "Oct 24 – Nov 1", for Settings. */
export function holidayDates(id: string): string {
  const h = HOLIDAYS.find((x) => x.id === id)
  if (!h) return ''
  const m = (x: [number, number]): string => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][x[0] - 1]} ${x[1]}`
  return `${m(h.from)} – ${m(h.to)}`
}
