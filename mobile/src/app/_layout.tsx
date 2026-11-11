import '../lib/polyfills'
import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as Notifications from 'expo-notifications'
import { DarkTheme, DefaultTheme, SplashScreen, ThemeProvider } from 'expo-router'
import { Stack } from 'expo-router/stack'
import { StatusBar } from 'expo-status-bar'
import { loadStore } from '../desktop/store'
// Also defines the background live-check task, which must happen when the app loads.
import { setupLiveAlerts } from '../lib/background'
import { setForeground, show, start } from '../lib/hub'
import { ReaderHost } from '../lib/reader'
import { loadProgress } from '../lib/ui'
import { loadQueue } from '../lib/queue'
import { loadWallpapers } from '../lib/wallpapers'
import { openChannel } from '../ui/channelMenu'
import { LoginSheet } from '../ui/LoginSheet'
import { MenuSheet } from '../ui/Menu'
import { useColors } from '../ui/theme'
import { BootIntro, LAUNCH_BACKGROUND } from '../ui/BootIntro'

const OPEN_ON_LAUNCH = 'streamhub:open-on-launch'

void SplashScreen.preventAutoHideAsync()

export default function RootLayout(): React.JSX.Element | null {
  const [ready, setReady] = useState(false)
  // The launch animation plays over the app while it loads, then gets out of the way.
  const [intro, setIntro] = useState(true)
  // The system launch screen goes as soon as the intro is on screen (it starts on the same frame).
  const introShown = useCallback(() => SplashScreen.hide(), [])
  const introDone = useCallback(() => setIntro(false), [])

  useEffect(() => {
    void (async () => {
      await Promise.all([loadStore(), loadProgress(), loadWallpapers().catch(() => undefined), loadQueue()])
      show()
      setReady(true)
      setupLiveAlerts().catch((e) => console.error('[alerts]', e))
    })()
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'))
    return () => sub.remove()
  }, [])

  // Syncing starts once the screens are up, with the page reader Twitch's live status is read in.
  useEffect(() => {
    if (ready) start()
  }, [ready])

  // Tapping a go-live alert opens that channel.
  useEffect(() => {
    if (!ready) return
    const open = (r: Notifications.NotificationResponse | null): void => {
      const key = r?.notification.request.content.data?.channelKey
      if (typeof key === 'string') openChannel(key)
    }
    open(Notifications.getLastNotificationResponse())
    const sub = Notifications.addNotificationResponseReceivedListener(open)
    // Testing aid: a channel key left here by a simulator test is opened once, on launch (opening a
    // link from outside the app asks for a tap the simulator tools can't give).
    AsyncStorage.getItem(OPEN_ON_LAUNCH)
      .then((key) => {
        if (!key) return
        void AsyncStorage.removeItem(OPEN_ON_LAUNCH)
        openChannel(key)
      })
      .catch(() => undefined)
    return () => sub.remove()
  }, [ready])

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: LAUNCH_BACKGROUND }}>
      <SafeAreaProvider>
        {ready ? <Themed /> : null}
        {intro ? <BootIntro ready={ready} onShown={introShown} onDone={introDone} /> : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

function Themed(): React.JSX.Element {
  const c = useColors()
  const base = c.dark ? DarkTheme : DefaultTheme
  const theme = { ...base, colors: { ...base.colors, primary: c.accent, background: c.bg, card: c.bg, text: c.fg, border: c.separator } }
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={c.dark ? 'light' : 'dark'} />
      {/* The offscreen page readers sit behind everything else. */}
      <ReaderHost />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="watch/[key]" />
        <Stack.Screen name="playlist" />
        <Stack.Screen name="playlist-info" />
        <Stack.Screen name="combine" options={{ presentation: 'modal' }} />
        <Stack.Screen name="import-playlists" options={{ presentation: 'modal' }} />
      </Stack>
      <LoginSheet />
      <MenuSheet />
    </ThemeProvider>
  )
}
