import { useEffect, useState } from 'react'
import { Animated, Dimensions, Linking, Modal, PanResponder, Platform as OS, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RELEASES_PAGE } from '@shared/release'
import { useApp } from '../lib/hub'
import { ipaUrl, openInstaller, shareIpa, showUpdateSheet, skipVersion, updateNow, useUpdateSheet } from '../lib/updater'
import { Icon } from './Icon'
import { useColors, type Colors } from './theme'

// The update sheet: "Update available" (both phones), its release notes, and on an iPhone the choice of
// how to install it — a sideloading app the .ipa link is handed to, or the .ipa itself to save.

interface Store {
  name: string
  icon: number
  /** URL scheme, to tell whether it's installed (listed in app.config.ts → LSApplicationQueriesSchemes). */
  scheme: string
  /** Its "install this .ipa" link; without one the downloaded file is handed over with the share sheet. */
  link?: (ipa: string) => string
  site: string
}

const STORES: Store[] = [
  { name: 'AltStore', icon: require('../../assets/stores/altstore.png'), scheme: 'altstore', link: (u) => `altstore://install?url=${encodeURIComponent(u)}`, site: 'https://altstore.io' },
  { name: 'SideStore', icon: require('../../assets/stores/sidestore.png'), scheme: 'sidestore', link: (u) => `sidestore://install?url=${encodeURIComponent(u)}`, site: 'https://sidestore.io' },
  { name: 'Feather', icon: require('../../assets/stores/feather.png'), scheme: 'feather', link: (u) => `feather://install/${u}`, site: 'https://github.com/claration/Feather' },
  // FlareStore has no documented install link: it gets the downloaded .ipa (share sheet → FlareStore).
  { name: 'FlareStore', icon: require('../../assets/stores/flarestore.png'), scheme: 'flarestore', site: 'https://flarestore.app' }
]

export function UpdateSheet(): React.JSX.Element {
  const page = useUpdateSheet((s) => s.page)
  const u = useApp((s) => s.app?.update)
  const c = useColors()
  const insets = useSafeAreaInsets()
  // Made once: the sheet's slide, and dragging it down to dismiss (not on the release notes, which scroll).
  const [{ y, pan }] = useState(() => {
    const y = new Animated.Value(Dimensions.get('window').height)
    const pan = PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => useUpdateSheet.getState().page !== 'notes' && g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => (g.dy > 120 || g.vy > 1 ? slideAway(y) : slideIn(y))
    })
    return { y, pan }
  })
  const open = Boolean(page && u?.version)

  useEffect(() => {
    if (open) slideIn(y)
  }, [open, y])

  const close = (): void => slideAway(y)


  const tall = page === 'install' || page === 'notes'
  const glass = OS.OS === 'ios' && isLiquidGlassAvailable()
  const sheetStyle = [
    styles.sheet,
    { marginBottom: Math.max(insets.bottom, 8), paddingBottom: 16 },
    tall && { top: insets.top + 8 },
    !glass && { backgroundColor: c.dark ? '#1c1c1f' : '#f4f4f7' }
  ]
  const body = !u || !page ? null : page === 'offer' ? <Offer close={close} /> : page === 'notes' ? <Notes notes={u.notes ?? ''} version={u.version ?? ''} /> : <Install close={close} />

  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => (page === 'offer' ? close() : showUpdateSheet('offer'))}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: '#0008' }]} onPress={close} accessibilityLabel="Later" />
      <Animated.View style={[styles.wrap, tall && { top: 0 }, { transform: [{ translateY: y }] }]} pointerEvents="box-none">
        {glass ? (
          <GlassView glassEffectStyle="regular" colorScheme={c.dark ? 'dark' : 'light'} style={sheetStyle} {...pan.panHandlers}>
            <View style={[styles.handle, { backgroundColor: c.fg3 }]} />
            {body}
          </GlassView>
        ) : (
          <View style={sheetStyle} {...pan.panHandlers}>
            <View style={[styles.handle, { backgroundColor: c.fg3 }]} />
            {body}
          </View>
        )}
      </Animated.View>
    </Modal>
  )
}

const slideIn = (y: Animated.Value): void => Animated.spring(y, { toValue: 0, damping: 24, stiffness: 240, useNativeDriver: true }).start()
const slideAway = (y: Animated.Value): void =>
  Animated.timing(y, { toValue: Dimensions.get('window').height, duration: 220, useNativeDriver: true }).start(() => showUpdateSheet(null))

/** "Update available": the new version, its notes, Update / Later / Skip this version. */
function Offer({ close }: { close(): void }): React.JSX.Element | null {
  const c = useColors()
  const u = useApp((s) => s.app?.update)
  if (!u?.version) return null
  const ios = OS.OS === 'ios'
  const label =
    u.state === 'downloading' ? `Downloading… ${Math.round((u.progress ?? 0) * 100)}%` : !ios && u.state === 'ready' ? 'Install' : 'Update'
  const update = (): void => {
    if (!u.inApp) return void Linking.openURL(u.page ?? RELEASES_PAGE)
    if (ios) showUpdateSheet('install')
    else void updateNow()
  }
  return (
    <View style={styles.offer}>
      <Image source={require('../../assets/icon.png')} style={styles.appIcon} />
      <View style={[styles.pill, { backgroundColor: tint(c, 0.12) }]}>
        <Text style={[styles.pillText, { color: c.fg2 }]}>NEW RELEASE</Text>
      </View>
      <Text style={[styles.bigTitle, { color: c.fg }, c.display ? { fontFamily: c.display } : null]}>Update available</Text>
      <Text style={[styles.sub, { color: c.fg3 }]}>See what’s new and get the latest version of StreamHub.</Text>
      <Text style={[styles.versions, { color: c.fg3 }]}>
        {u.current} → <Text style={{ color: c.accent, fontWeight: '700' }}>{u.version}</Text>
      </Text>
      {u.notes ? (
        <Pressable onPress={() => showUpdateSheet('notes')} style={({ pressed }) => [styles.notesLink, pressed && { opacity: 0.6 }]} accessibilityRole="button">
          <Text style={{ color: c.fg, fontSize: 17, fontWeight: '500' }}>Release Notes</Text>
          <Icon name="chevron-forward" size={18} color={c.fg} />
        </Pressable>
      ) : null}
      <Pressable
        onPress={update}
        disabled={u.state === 'downloading'}
        style={({ pressed }) => [styles.updateButton, { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 }]}
        accessibilityRole="button"
      >
        <Text style={{ color: c.onAccent, fontSize: 18, fontWeight: '600' }}>{label}</Text>
      </Pressable>
      {u.error ? <Text style={[styles.error, { color: c.danger }]}>{u.error}</Text> : null}
      <View style={styles.laterRow}>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button">
          <Text style={{ color: c.fg3, fontSize: 16 }}>Later</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            skipVersion(u.version ?? '')
            close()
          }}
          hitSlop={10}
          accessibilityRole="button"
        >
          <Text style={{ color: c.fg3, fontSize: 16 }}>Skip this version</Text>
        </Pressable>
      </View>
    </View>
  )
}

/** iPhone: "Update StreamHub" — continue in a sideloading app, or download the .ipa. */
function Install({ close }: { close(): void }): React.JSX.Element {
  const c = useColors()
  const u = useApp((s) => s.app?.update)
  const [installed, setInstalled] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all(STORES.map(async (s) => [s.name, await Linking.canOpenURL(`${s.scheme}://`).catch(() => false)] as const)).then((r) => setInstalled(Object.fromEntries(r)))
  }, [])

  const downloading = u?.state === 'downloading' ? `Downloading… ${Math.round((u.progress ?? 0) * 100)}%` : null

  // The .ipa downloads here, then the share sheet: Save to Files, or open it in FlareStore.
  const handOver = async (name: string): Promise<void> => {
    setBusy(name)
    setError(null)
    await shareIpa()
    setBusy(null)
  }

  const pick = async (s: Store): Promise<void> => {
    setError(null)
    const ipa = ipaUrl()
    if (!s.link) return handOver(s.name)
    if (!installed[s.name]) return void Linking.openURL(s.site)
    if (!ipa) return setError('This release has no iPhone app to install.')
    if (await openInstaller(s.link(ipa))) close()
    else setError(`Couldn’t open ${s.name}.`)
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.installHeader}>
        <Pressable onPress={() => showUpdateSheet('offer')} hitSlop={12} style={styles.back} accessibilityLabel="Back" accessibilityRole="button">
          <Icon name="chevron-back" size={26} color={c.fg} />
        </Pressable>
        <Text style={[styles.installTitle, { color: c.fg }, c.display ? { fontFamily: c.display } : null]} numberOfLines={1} adjustsFontSizeToFit>
          Update StreamHub
        </Text>
      </View>
      <Text style={[styles.sub, { color: c.fg3, marginBottom: 20 }]}>Choose how you’d like to update.</Text>
      <ScrollView contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
        {STORES.map((s) => (
          <Row
            key={s.name}
            icon={<Image source={s.icon} style={styles.rowIcon} />}
            title={s.name}
            detail={
              busy === s.name && downloading
                ? downloading
                : s.link && installed[s.name] === false
                  ? `Not installed · Get ${s.name}`
                  : `Continue in ${s.name}`
            }
            onPress={() => void pick(s)}
          />
        ))}
        <View style={[styles.divider, { backgroundColor: tint(c, 0.12) }]} />
        <Row
          icon={
            <View style={[styles.rowIcon, styles.downloadIcon]}>
              <Icon name="download-outline" size={30} color="#fff" />
            </View>
          }
          title="Download IPA"
          detail={busy === 'ipa' && downloading ? downloading : 'Save for manual installation'}
          onPress={() => void handOver('ipa')}
        />
        {error || u?.error ? <Text style={[styles.error, { color: c.danger }]}>{error ?? u?.error}</Text> : null}
      </ScrollView>
      <Pressable onPress={close} hitSlop={10} style={styles.cancel} accessibilityRole="button">
        <Text style={{ color: c.fg3, fontSize: 17 }}>Cancel</Text>
      </Pressable>
    </View>
  )
}

function Row({ icon, title, detail, onPress }: { icon: React.ReactNode; title: string; detail: string; onPress(): void }): React.JSX.Element {
  const c = useColors()
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { backgroundColor: tint(c, pressed ? 0.14 : 0.08) }]} accessibilityRole="button">
      {icon}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.fg, fontSize: 18, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: c.fg3, fontSize: 15 }} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <Icon name="chevron-forward" size={20} color={c.fg3} />
    </Pressable>
  )
}

/** The release notes (GitHub's Markdown, drawn simply: headings, bullets, plain text). */
function Notes({ notes, version }: { notes: string; version: string }): React.JSX.Element {
  const c = useColors()
  const lines = notes
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l, i, all) => l || (i > 0 && all[i - 1]))
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.installHeader}>
        <Pressable onPress={() => showUpdateSheet('offer')} hitSlop={12} style={styles.back} accessibilityLabel="Back" accessibilityRole="button">
          <Icon name="chevron-back" size={26} color={c.fg} />
        </Pressable>
        <Text style={[styles.notesTitle, { color: c.fg }, c.display ? { fontFamily: c.display } : null]}>What’s New in {version}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 24, gap: 6 }}>
        {lines.map((l, i) => {
          const heading = /^#+\s*/.exec(l)
          if (heading) return <Text key={i} style={{ color: c.fg, fontSize: 18, fontWeight: '700', marginTop: i ? 10 : 0 }}>{l.slice(heading[0].length)}</Text>
          const bullet = /^\s*[-*]\s+/.exec(l)
          if (bullet)
            return (
              <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: bullet[0].length > 2 ? 16 : 0 }}>
                <Text style={{ color: c.fg3, fontSize: 15, lineHeight: 21 }}>•</Text>
                <Text style={{ color: c.fg2, fontSize: 15, lineHeight: 21, flex: 1 }}>{l.slice(bullet[0].length)}</Text>
              </View>
            )
          return l ? <Text key={i} style={{ color: c.fg2, fontSize: 15, lineHeight: 21 }}>{l}</Text> : <View key={i} style={{ height: 4 }} />
        })}
      </ScrollView>
    </View>
  )
}

/** The foreground color at `alpha`, for rows and pills that sit on the sheet in either appearance. */
const tint = (c: Colors, alpha: number): string => (c.dark ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 0.6})`)

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: { position: 'absolute', left: 8, right: 8, bottom: 0, borderRadius: 38, overflow: 'hidden', paddingHorizontal: 20, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, opacity: 0.5, marginBottom: 14 },
  offer: { alignItems: 'center', paddingTop: 16 },
  appIcon: { width: 84, height: 84, borderRadius: 20, marginBottom: 18 },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 10 },
  pillText: { fontSize: 13, fontWeight: '600', letterSpacing: 1.6 },
  bigTitle: { fontSize: 36, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  sub: { fontSize: 17, lineHeight: 23, textAlign: 'center', paddingHorizontal: 12 },
  versions: { fontSize: 15, marginTop: 10, fontVariant: ['tabular-nums'] },
  notesLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 18, paddingVertical: 6 },
  updateButton: { alignSelf: 'stretch', height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 36 },
  laterRow: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-around', paddingTop: 18, paddingBottom: 6 },
  error: { fontSize: 13, textAlign: 'center', marginTop: 10 },
  installHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 48, marginBottom: 6 },
  back: { position: 'absolute', left: 0, padding: 4 },
  installTitle: { fontSize: 30, fontWeight: '700', paddingHorizontal: 36 },
  notesTitle: { fontSize: 22, fontWeight: '700', paddingHorizontal: 40, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, padding: 12 },
  rowIcon: { width: 56, height: 56, borderRadius: 13 },
  downloadIcon: { backgroundColor: '#8e8e93', alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth * 2, marginVertical: 6 },
  cancel: { alignSelf: 'center', paddingVertical: 14 }
})
