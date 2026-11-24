import { app, nativeImage, type BrowserWindow } from 'electron'
import path from 'node:path'
import { appIconFor } from '@shared/appIcons'
import { getSettings, onSettingsChange } from './settings'

// The dock icon (macOS) and window/taskbar icon (Windows, Linux) follow Customization → App Icon,
// and a holiday's icon while it lasts. Checked hourly, so holidays start and end by themselves.

const DIR = path.join(__dirname, '../../resources/app-icons')
const DEFAULT = path.join(__dirname, '../../resources/icon.png')
let shown = ''

function apply(getWindow: () => BrowserWindow | null): void {
  const id = appIconFor(getSettings())
  if (id === shown) return
  shown = id
  const isDefault = id === 'default'
  if (process.platform === 'darwin') app.dock?.setIcon(nativeImage.createFromPath(isDefault ? DEFAULT : path.join(DIR, 'mac', `${id}.png`)))
  else getWindow()?.setIcon(nativeImage.createFromPath(isDefault ? DEFAULT : path.join(DIR, 'win', `${id}.png`)))
}

export function startAppIcon(getWindow: () => BrowserWindow | null): void {
  apply(getWindow)
  onSettingsChange((next, prev) => {
    if (next.appIcon !== prev.appIcon || next.holidayIcons !== prev.holidayIcons) apply(getWindow)
  })
  setInterval(() => apply(getWindow), 60 * 60_000)
}

/** A new window starts with the default icon (Windows, Linux): give it the current one. */
export function iconForNewWindow(win: BrowserWindow): void {
  if (process.platform === 'darwin' || shown === '' || shown === 'default') return
  win.setIcon(nativeImage.createFromPath(path.join(DIR, 'win', `${shown}.png`)))
}
