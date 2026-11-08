import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import type { ShortcutAction } from '@shared/types'
import { shortcutsFor } from './settings'

// Shortcuts live on native menu items: menu accelerators are handled before web content, so they
// work even while a stream <webview> has keyboard focus. A menu item holds one accelerator, so an
// action's extra shortcuts go on hidden copies of it. Rebuilt whenever bindings change.

export function setupAppMenu(getMainWindow: () => BrowserWindow | null): void {
  const fire = (action: ShortcutAction) => () => {
    const win = getMainWindow()
    if (!win) return
    win.show()
    win.webContents.send('shortcut', action)
  }
  const item = (label: string, action: ShortcutAction): MenuItemConstructorOptions[] => {
    const [first, ...extra] = shortcutsFor(action)
    return [
      { label, accelerator: first, click: fire(action) },
      ...extra.map((accelerator) => ({ label, accelerator, click: fire(action), visible: false, acceleratorWorksWhenHidden: true }))
    ]
  }
  const isMac = process.platform === 'darwin'
  const menu = Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Controls',
      submenu: [
        ...item('Toggle Sidebar', 'toggleSidebar'),
        ...item('Channels', 'toggleChannels'),
        ...item('Multi-view', 'multiView'),
        ...item('Picture in Picture', 'pip'),
        ...item('Return Home', 'returnHome')
      ]
    },
    { role: 'windowMenu' }
  ])
  Menu.setApplicationMenu(menu)
}
