// Pure (no Electron imports) so it can be unit tested.

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Where the popup goes: beside the tray icon, on the side facing the rest of the screen. That's
 * below it in the macOS menu bar, above it in a bottom Windows taskbar, and beside it in a left or
 * right one. Without a tray position (opened by shortcut), the corner where the tray lives. Always
 * kept inside the screen's work area.
 */
export function popupPosition(
  size: { width: number; height: number },
  icon: Rect | undefined,
  display: { bounds: Rect; workArea: Rect },
  platform: string
): { x: number; y: number } {
  const area = display.workArea
  const gap = 6
  const clamp = (x: number, y: number): { x: number; y: number } => ({
    x: Math.round(Math.max(area.x + gap, Math.min(x, area.x + area.width - size.width - gap))),
    y: Math.round(Math.max(area.y + gap, Math.min(y, area.y + area.height - size.height - gap)))
  })
  if (!icon || icon.width <= 0 || icon.height <= 0) {
    // macOS: top right under the menu bar; Windows: bottom right above the taskbar clock.
    return platform === 'darwin'
      ? clamp(area.x + area.width - size.width - gap, area.y + gap)
      : clamp(area.x + area.width - size.width - gap, area.y + area.height - size.height - gap)
  }
  const cx = icon.x + icon.width / 2
  const cy = icon.y + icon.height / 2
  const b = display.bounds
  // The taskbar edge is the one the icon sits outside the work area on (or nearest to).
  const edge =
    icon.y >= area.y + area.height ? 'bottom'
    : icon.y + icon.height <= area.y ? 'top'
    : icon.x >= area.x + area.width ? 'right'
    : icon.x + icon.width <= area.x ? 'left'
    : cy > b.y + b.height / 2 ? 'bottom'
    : 'top'
  if (edge === 'bottom') return clamp(cx - size.width / 2, icon.y - size.height - gap)
  if (edge === 'top') return clamp(cx - size.width / 2, icon.y + icon.height + gap)
  if (edge === 'right') return clamp(icon.x - size.width - gap, cy - size.height / 2)
  return clamp(icon.x + icon.width + gap, cy - size.height / 2)
}
