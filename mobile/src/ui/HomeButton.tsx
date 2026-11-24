import { useEffect, useRef, useState } from 'react'
import { Animated, Platform as OS, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { router } from 'expo-router'
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect'
import { Ionicons } from '@expo/vector-icons'
import { Icon } from './Icon'

/** Liquid Glass where the system has it (iOS 26+), a translucent circle elsewhere. */
const glass = OS.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()

/** Round floating button over a player or banner, e.g. back or home. */
export function FloatingButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress(): void }): React.JSX.Element {
  const body = <Icon name={icon} size={20} color="#fff" />
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.press, pressed && styles.pressed]}>
      {glass ? (
        <GlassView glassEffectStyle="clear" isInteractive colorScheme="dark" style={styles.circle}>
          {body}
        </GlassView>
      ) : (
        <View style={[styles.circle, styles.fallback]}>{body}</View>
      )}
    </Pressable>
  )
}

/** Back to the Live tab; each screen that hides the dock shows it next to its back button. */
export function HomeButton(): React.JSX.Element {
  return <FloatingButton icon="home" label="Home" onPress={() => router.dismissTo('/')} />
}

/** How long Back and Home stay out over a video before folding back into one button. */
const NAV_OPEN_MS = 3_500

/**
 * Back and Home over a video, folded into one button so they cover less of the picture (issue #24):
 * a tap opens them, and they fold away again after a few seconds untouched.
 */
export function VideoNav({
  backIcon,
  backLabel = 'Back',
  onBack = () => router.back(),
  style
}: {
  backIcon: keyof typeof Ionicons.glyphMap
  backLabel?: string
  onBack?(): void
  style?: StyleProp<ViewStyle>
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [shown] = useState(() => new Animated.Value(0))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    Animated.timing(shown, { toValue: open ? 1 : 0, duration: 160, useNativeDriver: true }).start()
    if (timer.current) clearTimeout(timer.current)
    if (open) timer.current = setTimeout(() => setOpen(false), NAV_OPEN_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [open, shown])

  if (!open) {
    return (
      <View style={style}>
        <FloatingButton icon="ellipsis-horizontal" label="Show Back and Home" onPress={() => setOpen(true)} />
      </View>
    )
  }
  return (
    <Animated.View style={[style, styles.navRow, { opacity: shown, transform: [{ scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}>
      <FloatingButton icon={backIcon} label={backLabel} onPress={onBack} />
      <HomeButton />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  navRow: { flexDirection: 'row', gap: 8 },
  press: { borderRadius: 20 },
  pressed: { transform: [{ scale: 0.92 }] },
  circle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fallback: { backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)' }
})
