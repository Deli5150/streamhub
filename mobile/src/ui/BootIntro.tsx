import { useEffect, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

// The animated intro shown at launch, on iPhone and Android, in Big Picture's colors (its intro's
// near-black and violet-blue). The system's launch screen is just that background (app.config.ts),
// so this starts on the same frame and plays while the app loads underneath:
//   1. a blue glow blooms and "StreamHub" comes into focus;
//   2. a wave of blue rises from the bottom, its crest swaying, until it fills the screen;
//   3. once the app is ready, the wave carries on up and off the screen, sweeping the app into view.
// With Reduce Motion on, it simply fades.

/** Big Picture's intro colors; the launch screen's background in app.config.ts matches. */
export const LAUNCH_BACKGROUND = '#0b0b10'
const BLUE = '#786eff'
/** The wave's layers, back to front: lighter and see-through first, the solid blue last. */
const WAVES = ['rgba(120,110,255,0.35)', 'rgba(120,110,255,0.65)', BLUE]
const WAVE_STAGGER_MS = 110
/** How long the title has on its own before the wave comes in. */
const TITLE_MS = 750
const RISE_MS = 820
const SWEEP_MS = 760
/** The system launch screen's own fade-out: the intro starts moving once it's gone. */
const HANDOFF_MS = 200
/** Big Picture's intro easing (a fast start that settles gently). */
const SETTLE = Easing.bezier(0.16, 1, 0.3, 1)

const native = { useNativeDriver: true } as const

export function BootIntro({ ready, onShown, onDone }: { ready: boolean; onShown(): void; onDone(): void }): React.JSX.Element {
  const { width: W, height: H } = useWindowDimensions()
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null)
  // Set once the system launch screen has gone, so nothing plays behind it.
  const [onScreen, setOnScreen] = useState(false)
  // The wave covers the whole screen, so the app can be shown behind it.
  const [covered, setCovered] = useState(false)
  // Made once, kept for the intro's life.
  const [v] = useState(() => ({
    glow: new Animated.Value(0),
    title: new Animated.Value(0),
    waves: WAVES.map(() => new Animated.Value(0)),
    fade: new Animated.Value(1)
  }))

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion, () => setReduceMotion(false))
  }, [])

  // Glow and title, then the wave rises until it covers the screen.
  useEffect(() => {
    if (reduceMotion === null || !onScreen) return
    const titleIn = Animated.parallel([
      Animated.timing(v.glow, { toValue: 1, duration: reduceMotion ? 300 : 1100, easing: SETTLE, ...native }),
      Animated.timing(v.title, { toValue: 1, duration: reduceMotion ? 300 : 800, easing: SETTLE, ...native })
    ])
    if (reduceMotion) {
      titleIn.start(({ finished }) => finished && setCovered(true))
      return () => titleIn.stop()
    }
    const rise = Animated.stagger(
      WAVE_STAGGER_MS,
      v.waves.map((w) => Animated.timing(w, { toValue: 1, duration: RISE_MS, easing: Easing.inOut(Easing.cubic), ...native }))
    )
    titleIn.start()
    const t = setTimeout(() => rise.start(({ finished }) => finished && setCovered(true)), TITLE_MS)
    return () => {
      clearTimeout(t)
      titleIn.stop()
      rise.stop()
    }
  }, [reduceMotion, onScreen, v])

  // Once covered and the app is ready: the wave carries on up and away, front layer first.
  useEffect(() => {
    if (!covered || !ready) return
    const out = reduceMotion
      ? Animated.timing(v.fade, { toValue: 0, duration: 260, ...native })
      : Animated.stagger(
          90,
          [...v.waves].reverse().map((w) => Animated.timing(w, { toValue: 2, duration: SWEEP_MS, easing: Easing.in(Easing.cubic), ...native }))
        )
    out.start(({ finished }) => finished && onDone())
    return () => out.stop()
  }, [covered, ready, reduceMotion, v, onDone])

  // Each layer is a tall rounded shape much wider than the screen, so its top and bottom edges are
  // gentle curves: the wave's crest and its trailing edge. 0 = below the screen, 1 = covering it,
  // 2 = gone off the top.
  const waveW = W * 2.2
  const waveH = H + W * 0.6
  const waveStyle = (w: Animated.Value, i: number): object => ({
    width: waveW,
    height: waveH,
    borderRadius: waveW / 2,
    left: (W - waveW) / 2,
    backgroundColor: WAVES[i],
    transform: [
      { translateY: w.interpolate({ inputRange: [0, 1, 2], outputRange: [H + W * 0.1, -W * 0.2, -waveH - W * 0.2] }) },
      // The crest sways as it travels, each layer a little differently.
      { translateX: w.interpolate({ inputRange: [0, 0.5, 1, 1.5, 2], outputRange: [0, W * (0.06 - i * 0.03), 0, -W * (0.05 - i * 0.02), 0] }) },
      { rotate: w.interpolate({ inputRange: [0, 1, 2], outputRange: [`${-5 + i * 2}deg`, '0deg', `${4 - i * 2}deg`] }) }
    ]
  })

  return (
    <Animated.View
      pointerEvents={covered && ready ? 'none' : 'auto'}
      onLayout={() => {
        onShown()
        setTimeout(() => setOnScreen(true), HANDOFF_MS)
      }}
      style={[styles.fill, { opacity: v.fade }]}
      accessibilityLabel="StreamHub is starting"
    >
      {/* The dark backdrop with the glow and title. Once the wave covers the screen it goes, so the
          app is behind the wave as it sweeps away. */}
      {!covered || reduceMotion ? (
        <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
          <Animated.View style={[styles.glow, { opacity: v.glow, transform: [{ scale: v.glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
            {HALO.map((h) => (
              <View key={h.size} style={[styles.halo, { width: h.size, height: h.size, borderRadius: h.size / 2, opacity: h.opacity }]} />
            ))}
          </Animated.View>
          <Animated.View style={[styles.titleBox, { opacity: v.title, transform: [{ scale: v.title.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }] }]}>
            <Text style={styles.title}>StreamHub</Text>
            <Animated.View style={[styles.rule, { transform: [{ scaleX: v.title }] }]} />
          </Animated.View>
        </View>
      ) : null}
      {reduceMotion ? null : v.waves.map((w, i) => <Animated.View key={i} pointerEvents="none" style={[styles.wave, waveStyle(w, i)]} />)}
    </Animated.View>
  )
}

/** The glow, as rings of fading blue (a soft edge that looks the same on Android and iPhone). */
const HALO = [
  { size: 520, opacity: 0.05 },
  { size: 400, opacity: 0.08 },
  { size: 300, opacity: 0.12 },
  { size: 220, opacity: 0.16 }
]

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, zIndex: 1000, overflow: 'hidden' },
  backdrop: { backgroundColor: LAUNCH_BACKGROUND, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 520, height: 520, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', backgroundColor: BLUE },
  titleBox: { alignItems: 'center' },
  title: { color: '#ffffff', fontSize: 44, fontWeight: '800', letterSpacing: -0.5 },
  rule: { marginTop: 16, width: 120, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
  wave: { position: 'absolute', top: 0 }
})
