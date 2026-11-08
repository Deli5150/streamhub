import { app, BrowserWindow, globalShortcut, Menu, nativeImage, screen, Tray } from 'electron'
import path from 'node:path'
import type { MenubarTheme } from '@shared/types'
import { popupPosition } from './popupPosition'
import { getSettings, shortcutsFor } from './settings'

// Menu-bar app: a tray icon (the macOS menu bar, the Windows system tray) whose popup lists live
// channels (rendered by the same renderer bundle with ?view=menubar). The popup hides when it loses
// focus, like a native menu-bar extra.

const POPUP_SIZES: Record<MenubarTheme, { width: number; height: number }> = {
  default: { width: 360, height: 520 },
  operagx: { width: 360, height: 520 },
  gummy: { width: 440, height: 600 },
  terminal: { width: 480, height: 440 },
  shortcuts: { width: 340, height: 560 }
}

let tray: Tray | null = null
let popup: BrowserWindow | null = null
let registeredAccels: string[] = []
/** When the popup last hid because it lost focus (see togglePopup). */
let blurHiddenAt = 0
const TRAY_TIP = 'StreamHub — click for live channels'
let deps: { loadRenderer(win: BrowserWindow, view: string): void; showMain(): void; preload: string } | null = null

export function initMenubar(d: NonNullable<typeof deps>): void {
  deps = d
  syncMenubar()
}

/**
 * macOS: the monochrome template icon, which the system tints for light/dark menu bars. Windows and
 * Linux don't tint tray icons, so they get the colour app icon at tray size.
 */
function trayIcon(): Electron.NativeImage {
  if (process.platform === 'darwin') {
    const icon = nativeImage.createFromPath(path.join(__dirname, '../../resources/trayTemplate.png'))
    icon.setTemplateImage(true)
    return icon
  }
  return nativeImage.createFromPath(path.join(__dirname, '../../resources/icon.png')).resize({ width: 32, height: 32, quality: 'best' })
}

/** Creates or removes the tray and (re)registers the global toggle shortcut to match settings. */
export function syncMenubar(): void {
  const { enabled } = getSettings().menubar
  if (enabled && !tray) {
    tray = new Tray(trayIcon())
    tray.setToolTip(TRAY_TIP)
    const menu = Menu.buildFromTemplate([
      { label: 'Show live channels', click: () => togglePopup() },
      { label: 'Open StreamHub', click: () => deps?.showMain() },
      { type: 'separator' },
      { label: 'Quit StreamHub', role: 'quit' }
    ])
    // Linux desktops show tray icons as app indicators, which don't report clicks: the icon opens
    // this menu instead. Elsewhere a click opens the popup and a right-click the menu.
    if (process.platform === 'linux') tray.setContextMenu(menu)
    else {
      tray.on('click', () => togglePopup())
      tray.on('right-click', () => tray?.popUpContextMenu(menu))
    }
  } else if (!enabled && tray) {
    tray.destroy()
    tray = null
    // Destroyed rather than hidden: a hidden window would keep Windows from quitting when the main one closes.
    if (popup && !popup.isDestroyed()) popup.destroy()
    popup = null
  }
  if (popup && !popup.isDestroyed()) {
    const size = POPUP_SIZES[getSettings().menubar.theme]
    popup.setSize(size.width, size.height)
  }
  registerToggleShortcut()
}

function registerToggleShortcut(): void {
  for (const accel of registeredAccels) globalShortcut.unregister(accel)
  registeredAccels = []
  if (!tray) return
  for (const accel of shortcutsFor('toggleMenubarApp')) {
    if (globalShortcut.register(accel, () => togglePopup())) registeredAccels.push(accel)
  }
}

/** Whether there's a tray to keep the app running in after its windows close (Windows, Linux). */
export const hasTray = (): boolean => tray !== null

/** Shows the number of live channels next to the tray icon (macOS), or in its tooltip (Windows has no tray titles). */
export function setTrayLiveCount(count: number): void {
  if (!tray) return
  if (process.platform === 'darwin') tray.setTitle(count > 0 ? ` ${count}` : '', { fontType: 'monospacedDigit' })
  else tray.setToolTip(count > 0 ? `StreamHub — ${count} live` : TRAY_TIP)
}

function ensurePopup(): BrowserWindow {
  if (popup && !popup.isDestroyed()) return popup
  const size = POPUP_SIZES[getSettings().menubar.theme]
  popup = new BrowserWindow({
    ...size,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    webPreferences: { preload: deps!.preload }
  })
  popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  popup.on('blur', () => {
    if (!popup?.isVisible()) return
    popup.hide()
    blurHiddenAt = Date.now()
  })
  deps!.loadRenderer(popup, 'menubar')
  return popup
}

export function hidePopup(): void {
  popup?.hide()
}

function togglePopup(): void {
  const win = ensurePopup()
  if (win.isVisible()) return win.hide()
  // Windows: clicking the tray icon while the popup is open first takes focus from the popup (which
  // hides it), then delivers the click; that click is meant to close it, not reopen it.
  if (Date.now() - blurHiddenAt < 300) return
  const size = POPUP_SIZES[getSettings().menubar.theme]
  // Linux trays don't say where their icon is; the pointer is next to it (the tray's menu was just
  // used), so the popup opens there.
  const pointer = screen.getCursorScreenPoint()
  const icon = process.platform === 'linux' ? { x: pointer.x - 1, y: pointer.y - 1, width: 2, height: 2 } : tray?.getBounds()
  const display = icon && icon.width > 0 ? screen.getDisplayNearestPoint({ x: icon.x, y: icon.y }) : screen.getPrimaryDisplay()
  win.setBounds({ ...popupPosition(size, icon, display, process.platform), ...size })
  win.show()
  win.focus()
}

app.on('will-quit', () => globalShortcut.unregisterAll())
