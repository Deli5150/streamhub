import { AppState, Platform as OS } from 'react-native'
import { appIconFor } from '@shared/appIcons'
import AppIcons from '../../modules/app-icons/src/AppIconsModule'
import { getSettings } from './settings'

// The home-screen icon follows Settings → App Icon, and a holiday's icon while it lasts.
// iPhone: switched right away (iOS only allows it while the app is open, with a short alert).
// Android: switched when the app goes to the background, as some launchers close an app whose
// launcher entry changes while it's open.

function apply(): void {
  if (!AppIcons) return
  const id = appIconFor(getSettings())
  try {
    if (AppIcons.current() !== id) void AppIcons.set(id).catch((e) => console.warn('[app icon]', e))
  } catch (e) {
    console.warn('[app icon]', e)
  }
}

let started = false
export function startAppIcon(): void {
  if (started || !AppIcons) return
  started = true
  if (OS.OS === 'ios') {
    apply()
    AppState.addEventListener('change', (s) => s === 'active' && apply())
  } else AppState.addEventListener('change', (s) => s === 'background' && apply())
}

/** After the setting changes: iPhone switches now; Android when you leave the app. */
export const appIconChanged = (): void => void (OS.OS === 'ios' && apply())
