import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { useWallpaperIsLight, useWallpapers, wallpaperUri } from '../lib/wallpapers'

const DWELL_MS = 8000
const FADE_MS = 1200

/** Wallpaper(s) behind the Live tab, crossfading when several are enabled, with a legibility scrim. */
export function HomeBackground(): React.JSX.Element | null {
  const { images, multiEnabled, fit, zoom, rotation } = useWallpapers()
  const isLight = useWallpaperIsLight()
  const shown = multiEnabled ? images : images.slice(0, 1)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (shown.length < 2) return
    const id = setInterval(() => setTick((t) => t + 1), DWELL_MS)
    return () => clearInterval(id)
  }, [shown.length])

  if (!shown.length) return null
  const current = shown[tick % shown.length]
  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none" aria-hidden>
      <View style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${rotation}deg` }, { scale: zoom }] }]}>
        {/* expo-image cross-dissolves to the next wallpaper when its source changes. */}
        <Image source={wallpaperUri(current)} style={StyleSheet.absoluteFill} contentFit={fit} transition={{ duration: FADE_MS, effect: 'cross-dissolve' }} />
      </View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: isLight ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.5)' }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' }
})
