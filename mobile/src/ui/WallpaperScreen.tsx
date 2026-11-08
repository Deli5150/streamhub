import { useMemo, type ReactNode } from 'react'
import { View } from 'react-native'
import { useIsFocused } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useWallpaperIsLight } from '../lib/wallpapers'
import { HomeBackground } from './HomeBackground'
import { ColorsOverride, overWallpaper, useColors } from './theme'

/**
 * A tab drawn over the wallpaper (Live, Channels). Everything inside takes colors that read on it:
 * black or white text by the image's brightness, and rows on frosted panels.
 */
export function WallpaperScreen({ children }: { children: ReactNode }): React.JSX.Element {
  const base = useColors()
  const isLight = useWallpaperIsLight()
  const focused = useIsFocused()
  const colors = useMemo(() => (isLight === null ? null : overWallpaper(base, isLight)), [base, isLight])
  return (
    <View style={{ flex: 1, backgroundColor: base.bg }}>
      <HomeBackground />
      {colors && focused ? <StatusBar style={colors.dark ? 'light' : 'dark'} /> : null}
      <ColorsOverride.Provider value={colors}>{children}</ColorsOverride.Provider>
    </View>
  )
}
