import { useState } from 'react'
import { Platform as OS, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Constants from 'expo-constants'
import { Ionicons } from '@expo/vector-icons'
import { PLATFORM_LABEL, type AccountInfo, type Platform, type SyncStatus } from '@shared/types'
import { DEFAULT_THEME_ID, THEMES } from '@shared/themes'
import { actions, useApp } from '../../lib/hub'
import { syncNow, syncSignIn, syncSignOut } from '../../lib/sync'
import { Button, DOCK_SPACE, Group, GroupRow } from '../../ui/components'
import { WallpaperSettings } from '../../ui/WallpaperSettings'
import { PLATFORM_COLOR, errorMessage, useColors } from '../../ui/theme'

const HOW: Record<Platform, string> = {
  twitch: 'Sign in on twitch.tv. The channels you follow are read from your Following page — no developer keys required.',
  youtube:
    OS.OS === 'android'
      ? 'Sign in on youtube.com. Your subscriptions are read from that session, and chat is signed in as you.'
      : 'Sign in with Google (read-only access to your subscriptions), then on youtube.com so you can chat as yourself.',
  kick: 'Sign in on kick.com. Your followed channels are read from that session.',
  rumble: 'Sign in on rumble.com. The channels you follow are read from that session.'
}

export default function SettingsScreen(): React.JSX.Element {
  const app = useApp((s) => s.app)!
  const c = useColors()
  const insets = useSafeAreaInsets()
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + DOCK_SPACE + 16 }}>
      <Text style={[styles.title, { color: c.fg }]}>Settings</Text>

      <Text style={[styles.heading, { color: c.fg2 }]}>SYNC WITH GOOGLE</Text>
      <SyncCard sync={app.sync} />

      <Text style={[styles.heading, { color: c.fg2 }]}>ACCOUNTS</Text>
      <Text style={[styles.intro, { color: c.fg3 }]}>Sign in to each platform once. StreamHub keeps you signed in and keeps the channels you follow in sync.</Text>
      {app.accounts.map((a) => (
        <AccountCard key={a.platform} account={a} syncing={app.syncing.includes(a.platform)} count={app.channels.filter((ch) => ch.platform === a.platform).length} />
      ))}

      <Text style={[styles.heading, { color: c.fg2 }]}>NOTIFICATIONS</Text>
      <Group footer="While StreamHub is open, live status is checked every 1–2 minutes. In the background your phone decides how often StreamHub may check (usually every 15 minutes or more). Mute a channel’s alerts by pressing and holding it.">
        <GroupRow first label="Go-live alerts" detail="When a channel you follow starts streaming">
          <Switch value={app.settings.notifyLive} onValueChange={(v) => actions.updateSettings({ notifyLive: v })} />
        </GroupRow>
      </Group>

      <Text style={[styles.heading, { color: c.fg2 }]}>PLAYBACK</Text>
      <Group footer="Twitch puts ad breaks into the stream itself. During one, StreamHub switches to a copy of the stream that has no ads, or cuts the ads out. On some iPhones Twitch plays through the system’s own video player; StreamHub then asks for a kind of stream that usually comes without ads, but can’t cut ads that still appear in it.">
        <GroupRow first label="Block Twitch ads" detail="Applies to live streams; reopens the player">
          <Switch value={app.settings.blockTwitchAds} onValueChange={(v) => actions.updateSettings({ blockTwitchAds: v })} />
        </GroupRow>
      </Group>

      <Text style={[styles.heading, { color: c.fg2 }]}>THEME</Text>
      <View style={styles.swatches}>
        <Swatch id={DEFAULT_THEME_ID} name="System" bg={c.dark ? '#1c1c1e' : '#ffffff'} fg={c.dark ? '#f5f5f7' : '#1c1c1e'} accent={c.dark ? '#0a84ff' : '#007aff'} />
        {THEMES.map((t) => (
          <Swatch key={t.id} id={t.id} name={t.name} bg={t.background} fg={t.foreground} accent={t.accent} />
        ))}
      </View>

      <Text style={[styles.heading, { color: c.fg2 }]}>WALLPAPER</Text>
      <WallpaperSettings />

      <Text style={[styles.version, { color: c.fg3 }]}>StreamHub {Constants.expoConfig?.version ?? ''}</Text>
    </ScrollView>
  )
}

function Swatch({ id, name, bg, fg, accent }: { id: string; name: string; bg: string; fg: string; accent: string }): React.JSX.Element {
  const c = useColors()
  const active = useApp((s) => s.app?.settings.theme === id)
  return (
    <Pressable onPress={() => actions.updateSettings({ theme: id })} style={styles.swatch} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${name} theme`}>
      <View style={[styles.swatchBox, { backgroundColor: bg, borderColor: active ? c.accent : c.separator, borderWidth: active ? 2.5 : StyleSheet.hairlineWidth }]}>
        <Text style={{ color: fg, fontWeight: '700' }}>Aa</Text>
        <View style={[styles.swatchAccent, { backgroundColor: accent }]} />
      </View>
      <Text numberOfLines={1} style={{ color: active ? c.fg : c.fg3, fontSize: 12 }}>
        {name}
      </Text>
    </Pressable>
  )
}

function AccountCard({ account: a, syncing, count }: { account: AccountInfo; syncing: boolean; count: number }): React.JSX.Element {
  const c = useColors()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      const msg = errorMessage(e)
      if (!/window closed|cancelled/i.test(msg)) setError(msg)
    } finally {
      setBusy(false)
    }
  }
  const shownError = error ?? a.error
  const color = PLATFORM_COLOR[a.platform]
  return (
    <Group>
      <GroupRow
        first
        label={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
            <Text style={{ color: c.fg, fontSize: 17, fontWeight: '700' }}>{PLATFORM_LABEL[a.platform]}</Text>
          </View>
        }
        detail={
          a.connected
            ? `${a.username && a.username !== 'Signed in' ? `Connected as ${a.username}` : 'Connected'} · ${count} ${count === 1 ? 'channel' : 'channels'}`
            : HOW[a.platform]
        }
      >
        <Ionicons name={a.connected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={a.connected ? c.success : c.fg3} />
      </GroupRow>
      <View style={[styles.actions, { borderTopColor: c.separator }]}>
        {a.connected ? (
          <>
            <Button title={syncing ? 'Syncing…' : 'Sync'} icon="refresh" variant="filled" busy={syncing} disabled={busy} onPress={() => run(() => actions.refresh())} />
            {a.error ? <Button title="Reconnect" variant="accent" color={color} disabled={busy} onPress={() => run(() => actions.login(a.platform))} /> : null}
            <View style={{ flex: 1 }} />
            <Button title="Disconnect" variant="danger" disabled={busy} onPress={() => run(() => actions.logout(a.platform))} />
          </>
        ) : (
          <Button title={busy ? 'Signing in…' : `Sign in with ${PLATFORM_LABEL[a.platform]}`} variant="accent" color={color} busy={busy} onPress={() => run(() => actions.login(a.platform))} />
        )}
      </View>
      {shownError ? (
        <View style={[styles.error, { borderTopColor: c.separator }]}>
          <Ionicons name="warning" size={16} color={c.danger} />
          <Text style={{ color: c.danger, flex: 1, fontSize: 13 }}>{shownError}</Text>
        </View>
      ) : null}
    </Group>
  )
}

/** How long ago, roughly ("just now", "5 min ago", "3 h ago"). */
function ago(at: number): string {
  const min = Math.round((Date.now() - at) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

/** Sync with Google (the desktop's Accounts → Sync card): sign-ins, settings, follows and Watch Later. */
function SyncCard({ sync }: { sync: SyncStatus }): React.JSX.Element {
  const c = useColors()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      const msg = errorMessage(e)
      if (!/cancelled/i.test(msg)) setError(msg)
    } finally {
      setBusy(false)
    }
  }
  const shownError = error ?? sync.error
  return (
    <Group footer={sync.signedIn ? 'If a platform asks you to sign in again on this phone, signing in once fixes it.' : undefined}>
      <GroupRow
        first
        label="Sync with Google"
        detail={
          sync.signedIn
            ? `${sync.email ? `Syncing as ${sync.email}` : 'On'} · ${sync.syncing ? 'syncing now…' : sync.lastSync ? `last synced ${ago(sync.lastSync)}` : 'not synced yet'}`
            : 'Keep your platform sign-ins, settings, channels, combined channels, muted alerts and Watch Later the same on every phone and computer with StreamHub, saved in a private StreamHub folder in your Google Drive.'
        }
      >
        <Ionicons name={sync.signedIn ? 'cloud-done' : 'cloud-outline'} size={22} color={sync.signedIn ? c.success : c.fg3} />
      </GroupRow>
      <View style={[styles.actions, { borderTopColor: c.separator }]}>
        {sync.signedIn ? (
          <>
            <Button title="Sync now" icon="refresh" variant="filled" busy={sync.syncing} disabled={busy} onPress={() => run(() => syncNow())} />
            <View style={{ flex: 1 }} />
            <Button title="Turn off" variant="danger" disabled={busy} onPress={() => run(() => syncSignOut())} />
          </>
        ) : (
          <Button title={busy ? 'Signing in…' : 'Sign in with Google'} variant="accent" busy={busy} onPress={() => run(() => syncSignIn())} />
        )}
      </View>
      {shownError ? (
        <View style={[styles.error, { borderTopColor: c.separator }]}>
          <Ionicons name="warning" size={16} color={c.danger} />
          <Text style={{ color: c.danger, flex: 1, fontSize: 13 }}>{shownError}</Text>
        </View>
      ) : null}
    </Group>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 32, fontWeight: '800', marginBottom: 8 },
  heading: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 6, marginLeft: 4 },
  intro: { fontSize: 13, lineHeight: 18, marginBottom: 12, marginLeft: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  error: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  swatch: { width: 64, alignItems: 'center', gap: 4 },
  swatchBox: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  swatchAccent: { position: 'absolute', bottom: 6, right: 6, width: 12, height: 12, borderRadius: 6 },
  version: { textAlign: 'center', marginTop: 24, fontSize: 12 }
})
