import { useEffect, useSyncExternalStore } from 'react'
import { AppState, Dimensions, Platform, useWindowDimensions, type ScaledSize } from 'react-native'
import { useIsFocused } from 'expo-router'
import StreamhubPip from '../../modules/streamhub-pip/src/StreamhubPipModule'

// Android picture-in-picture. Android can't put one web page's video into PiP the way iPhones do:
// the whole app shrinks into the small window instead. While it's there, the screen showing the
// player hides everything else (usePipActive), keeping the player itself mounted so the stream
// doesn't reload. Players in the native video player (Kick videos) use the system's own PiP.

const pip = Platform.OS === 'android' ? StreamhubPip : null

/** Whether the app-window kind of picture-in-picture applies on this phone. */
export const appPipSupported = (): boolean => pip?.isSupported() ?? false

/** Video players are 16:9. */
const ASPECT = [16, 9] as const

/** Shrinks the app into the picture-in-picture window. */
export async function enterAppPip(): Promise<boolean> {
  if (!pip?.isSupported()) return false
  return pip.enter(...ASPECT).catch(() => false)
}

// The window resizes on entering and leaving PiP, and the app goes to the background and back;
// either is a cue to ask Android again.
let active = false
/** The window as screens should lay out for: during PiP, the window from before it started. */
let layoutWindow: ScaledSize = Dimensions.get('window')
const listeners = new Set<() => void>()
function refresh(): void {
  const now = pip?.isActive() ?? false
  const window = Dimensions.get('window')
  const resized = !now && (window.width !== layoutWindow.width || window.height !== layoutWindow.height)
  if (resized) layoutWindow = window
  if (now === active && !resized) return
  active = now
  for (const l of listeners) l()
}
if (pip) {
  Dimensions.addEventListener('change', refresh)
  AppState.addEventListener('change', refresh)
}
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Whether the app is showing in the picture-in-picture window right now. */
export const usePipActive = (): boolean => useSyncExternalStore(subscribe, () => active)

/**
 * The window size to lay a screen out for — useWindowDimensions(), except that during
 * picture-in-picture it stays what it was before: the small window's shape must not switch a screen
 * to another layout (which would reload its player).
 */
export function useLayoutWindow(): ScaledSize {
  const window = useWindowDimensions()
  const inPip = usePipActive()
  const before = useSyncExternalStore(subscribe, () => layoutWindow)
  return inPip ? before : window
}

/**
 * Android 12+: while `playing` and this screen is showing, leaving the app (home gesture) moves the
 * stream into picture-in-picture by itself, as with other video apps.
 */
export function useAutoPip(playing: boolean): void {
  const focused = useIsFocused()
  const on = Boolean(pip) && playing && focused
  useEffect(() => {
    if (!on || !pip?.isSupported()) return
    void pip.setAutoEnter(true, ...ASPECT).catch(() => false)
    return () => void pip.setAutoEnter(false, ...ASPECT).catch(() => false)
  }, [on])
}
