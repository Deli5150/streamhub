import { Platform as OS, Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect'
import { Ionicons } from '@expo/vector-icons'

/** Liquid Glass where the system has it (iOS 26+), a translucent circle elsewhere. */
const glass = OS.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()

/** Round floating button over a player or banner, e.g. back or home. */
export function FloatingButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress(): void }): React.JSX.Element {
  const body = <Ionicons name={icon} size={20} color="#fff" />
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

const styles = StyleSheet.create({
  press: { borderRadius: 20 },
  pressed: { transform: [{ scale: 0.92 }] },
  circle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fallback: { backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)' }
})
