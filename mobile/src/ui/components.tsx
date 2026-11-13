import { memo, useState, type ReactNode } from 'react'
import { ActivityIndicator, Platform as OS, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { Icon } from './Icon'
import type { Channel, LiveInfo, Platform } from '@shared/types'
import { PLATFORM_LABEL } from '@shared/types'
import { FLOATING_DOCK_SPACE, useFloatingDock } from './FloatingDock'
import { PLATFORM_COLOR, formatViewers, uptime, useColors } from './theme'

/**
 * Room to leave under a dock tab's content: on iOS 26+ the Liquid Glass dock floats over it, as
 * does Android's floating dock (Android's navigation bar sits below the content instead).
 */
export function useDockSpace(): number {
  const floating = useFloatingDock()
  return OS.OS === 'ios' ? 84 : floating ? FLOATING_DOCK_SPACE : 16
}

/**
 * Side padding for a full-screen video in landscape: as wide as the larger side inset (the camera
 * cutout's) on both sides, so the video stays clear of the cutout and centered on the screen whichever
 * way the phone is turned (issue #6).
 */
export function centered(insets: { left: number; right: number }): { paddingHorizontal: number } {
  return { paddingHorizontal: Math.max(insets.left, insets.right) }
}

/** Avatar that falls back to the channel's initial, with a brand badge in the corner. */
export const Avatar = memo(function Avatar({ channel, size = 40, live = false, platforms }: { channel: Channel; size?: number; live?: boolean; platforms?: Platform[] }) {
  const c = useColors()
  const [failed, setFailed] = useState(false)
  // The ring's exact radius: Android draws a border with a larger-than-the-box radius (999) square.
  const ring = live ? { borderWidth: 2, borderColor: '#eb0400', padding: 1, borderRadius: (size + 6) / 2 } : null
  return (
    <View style={{ width: size + (live ? 6 : 0), height: size + (live ? 6 : 0) }}>
      <View style={[{ borderRadius: size / 2 }, ring]}>
        {channel.avatarUrl && !failed ? (
          <Image source={channel.avatarUrl} style={{ width: size, height: size, borderRadius: size / 2 }} onError={() => setFailed(true)} recyclingKey={channel.key} transition={150} cachePolicy="memory-disk" />
        ) : (
          <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: c.fg2, fontWeight: '700', fontSize: size * 0.42 }}>{channel.displayName.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={[styles.badgeRow, { borderColor: c.bg }]}>
        {(platforms ?? [channel.platform]).map((p, i) => (
          <PlatformDot key={`${p}${i}`} platform={p} size={Math.max(10, size * 0.32)} />
        ))}
      </View>
    </View>
  )
})

export function PlatformDot({ platform, size = 10 }: { platform: Platform; size?: number }): React.JSX.Element {
  return <View accessibilityLabel={PLATFORM_LABEL[platform]} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: PLATFORM_COLOR[platform], borderWidth: 1.5, borderColor: '#0006' }} />
}

export function Thumbnail({ uri, style, children }: { uri?: string; style?: StyleProp<ViewStyle>; children?: ReactNode }): React.JSX.Element {
  const c = useColors()
  const [failed, setFailed] = useState(false)
  return (
    <View style={[styles.thumb, { backgroundColor: c.bg2 }, c.style && styles.thumbStyled, style]}>
      {uri && !failed ? (
        <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} onError={() => setFailed(true)} cachePolicy="memory-disk" recyclingKey={uri} />
      ) : (
        <Icon name="videocam-outline" size={28} color={c.fg3} />
      )}
      {children}
    </View>
  )
}

/** Twitch "Following"-style card: 16:9 preview with a viewer pill, then avatar, name and title. */
export const LiveCard = memo(function LiveCard({
  channel,
  live,
  platforms,
  compact = false,
  onPress,
  onLongPress
}: {
  channel: Channel
  live: LiveInfo
  platforms?: Platform[]
  /** A row with a small preview beside the text (phones), instead of a full-width card. */
  compact?: boolean
  onPress(): void
  onLongPress?(): void
}) {
  const c = useColors()
  if (compact) {
    return (
      <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.compact, c.overWallpaper && [styles.panel, { backgroundColor: c.card }], pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${channel.displayName}, live: ${live.title}`}>
        <Thumbnail uri={live.thumbnail} style={styles.compactThumb}>
          {live.viewers !== undefined && (
            <View style={[styles.viewers, styles.compactPill]}>
              <View style={styles.redDot} />
              <Text style={styles.viewerText}>{formatViewers(live.viewers)}</Text>
            </View>
          )}
        </Thumbnail>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Avatar channel={channel} size={18} platforms={platforms} />
            <Text numberOfLines={1} style={[styles.name, { color: c.fg, flex: 1 }]}>
              {channel.displayName}
            </Text>
          </View>
          <Text numberOfLines={2} style={[styles.sub, { color: c.fg2 }]}>
            {live.title || 'Live now'}
          </Text>
          <Text numberOfLines={1} style={[styles.sub, { color: c.fg3 }]}>
            {[live.category, uptime(live.startedAt)].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </Pressable>
    )
  }
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.card, c.overWallpaper && [styles.panel, { backgroundColor: c.card }], pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${channel.displayName}, live: ${live.title}`}>
      <Thumbnail uri={live.thumbnail}>
        <View style={[styles.liveBadge, c.style && styles.pill, c.style === 'pixel' && styles.pixelLive, c.style === 'nothing' && styles.nothingLive]}>
          <Text style={[styles.liveText, c.style === 'nothing' && styles.nothingMono]}>LIVE</Text>
        </View>
        {live.viewers !== undefined && (
          <View style={[styles.viewers, c.style && styles.pill]}>
            <View style={styles.redDot} />
            <Text style={[styles.viewerText, c.style === 'nothing' && styles.nothingCount]}>{formatViewers(live.viewers)}</Text>
          </View>
        )}
        {live.startedAt && (
          <View style={styles.uptime}>
            <Text style={styles.viewerText}>{uptime(live.startedAt)}</Text>
          </View>
        )}
      </Thumbnail>
      <View style={styles.cardBody}>
        <Avatar channel={channel} size={36} platforms={platforms} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[styles.name, { color: c.fg }]}>
            {channel.displayName}
          </Text>
          <Text numberOfLines={2} style={[styles.sub, { color: c.fg2 }]}>
            {live.title || 'Live now'}
          </Text>
          {live.category ? (
            <Text numberOfLines={1} style={[styles.sub, { color: c.fg3 }]}>
              {live.category}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
})

/** Avatar with name and category / viewer count (Channels list, pickers). */
export const ChannelRow = memo(function ChannelRow({
  channel,
  live,
  platforms,
  right,
  onPress,
  onLongPress
}: {
  channel: Channel
  live?: LiveInfo
  platforms?: Platform[]
  right?: ReactNode
  onPress?(): void
  onLongPress?(): void
}) {
  const c = useColors()
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, c.overWallpaper && [styles.rowPanel, { backgroundColor: c.card }], pressed && { backgroundColor: c.bg2 }]}
      accessibilityRole="button"
    >
      <Avatar channel={channel} size={40} live={Boolean(live)} platforms={platforms} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.name, { color: c.fg }]}>
          {channel.displayName}
        </Text>
        <Text numberOfLines={1} style={[styles.sub, { color: live ? c.fg2 : c.fg3 }]}>
          {live ? [live.category, live.viewers !== undefined ? `${formatViewers(live.viewers)} viewers` : ''].filter(Boolean).join(' · ') || 'Live' : PLATFORM_LABEL[channel.platform]}
        </Text>
      </View>
      {right}
    </Pressable>
  )
})

export function Chip({ label, active, color, onPress, icon }: { label: string; active: boolean; color?: string; onPress(): void; icon?: ReactNode }): React.JSX.Element {
  const c = useColors()
  const bg = active ? (color ?? c.accent) : c.bg2
  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: bg }]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      {icon}
      <Text style={{ color: active ? (color === PLATFORM_COLOR.kick ? '#000' : '#fff') : c.fg2, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}

export function PlatformChip({ platform, active, onPress }: { platform: Platform; active: boolean; onPress(): void }): React.JSX.Element {
  return <Chip label={PLATFORM_LABEL[platform]} active={active} color={PLATFORM_COLOR[platform]} onPress={onPress} />
}

export function Button({
  title,
  onPress,
  variant = 'filled',
  icon,
  disabled,
  busy,
  color
}: {
  title: string
  onPress(): void
  variant?: 'filled' | 'accent' | 'plain' | 'danger'
  icon?: keyof typeof Ionicons.glyphMap
  disabled?: boolean
  busy?: boolean
  color?: string
}): React.JSX.Element {
  const c = useColors()
  const bg = variant === 'accent' ? (color ?? c.accent) : variant === 'filled' ? c.bg2 : 'transparent'
  const fg = variant === 'accent' ? (color === PLATFORM_COLOR.kick ? '#000' : '#fff') : variant === 'danger' ? c.danger : variant === 'plain' ? c.accent : c.fg
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [styles.button, c.style && styles.pill, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}
      accessibilityRole="button"
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: 15 }}>{title}</Text>
    </Pressable>
  )
}

export function IconButton({ icon, onPress, label, color, size = 22, active }: { icon: keyof typeof Ionicons.glyphMap; onPress(): void; label: string; color?: string; size?: number; active?: boolean }): React.JSX.Element {
  const c = useColors()
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.iconButton, { backgroundColor: active ? c.bg2 : 'transparent', opacity: pressed ? 0.6 : 1 }]}>
      <Icon name={icon} size={size} color={color ?? c.fg} />
    </Pressable>
  )
}

export function EmptyState({ icon, title, text, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; text?: string; action?: ReactNode }): React.JSX.Element {
  const c = useColors()
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={44} color={c.fg3} />
      <Text style={[styles.emptyTitle, { color: c.fg }]}>{title}</Text>
      {text ? <Text style={[styles.emptyText, { color: c.fg3 }]}>{text}</Text> : null}
      {action}
    </View>
  )
}

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }): React.JSX.Element {
  const c = useColors()
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: c.fg }]}>{title}</Text>
      {right}
    </View>
  )
}

/** Grouped settings-style rows. */
export function Group({ children, footer }: { children: ReactNode; footer?: string }): React.JSX.Element {
  const c = useColors()
  return (
    <View style={{ marginBottom: 24 }}>
      <View style={[styles.group, { backgroundColor: c.card, borderColor: c.separator }, c.style && styles.groupStyled]}>{children}</View>
      {footer ? <Text style={[styles.footer, { color: c.fg3 }]}>{footer}</Text> : null}
    </View>
  )
}

export function GroupRow({ label, detail, children, onPress, first }: { label: ReactNode; detail?: string; children?: ReactNode; onPress?(): void; first?: boolean }): React.JSX.Element {
  const c = useColors()
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.groupRow,
        // Rows are split by a hairline; Pixel splits them into separate rounded-off rows (a gap in the
        // window color, as Android 16's settings do), Nothing by a dotted rule.
        !first &&
          (c.style === 'pixel'
            ? { borderTopWidth: 3, borderTopColor: c.bg }
            : c.style === 'nothing'
              ? { borderTopWidth: 1, borderStyle: 'dotted', borderTopColor: c.fg3 }
              : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator }),
        pressed && { backgroundColor: c.bg2 }
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof label === 'string' ? <Text style={{ color: c.fg, fontSize: 16 }}>{label}</Text> : label}
        {detail ? <Text style={{ color: c.fg3, fontSize: 13, marginTop: 2 }}>{detail}</Text> : null}
      </View>
      {children}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  badgeRow: { position: 'absolute', left: -2, bottom: -2, flexDirection: 'row', gap: 1 },
  thumb: { aspectRatio: 16 / 9, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  card: { gap: 10 },
  panel: { borderRadius: 12, padding: 8 },
  rowPanel: { marginHorizontal: 10, marginVertical: 2, borderRadius: 12, paddingHorizontal: 10 },
  compact: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  compactThumb: { width: '42%', maxWidth: 220, borderRadius: 8 },
  compactPill: { bottom: 4, left: 4, paddingHorizontal: 5, paddingVertical: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  liveBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: '#eb0400', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  liveText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  viewers: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#000a', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  uptime: { position: 'absolute', bottom: 8, right: 8, backgroundColor: '#000a', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  redDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#eb0400' },
  viewerText: { color: '#fff', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  cardBody: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  name: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 16 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 10 },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10, flex: 1 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  group: { borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  // The styled themes (Nothing, Pixel): pills, rounder cards and thumbnails, no outlines.
  groupStyled: { borderRadius: 24, borderWidth: 0 },
  thumbStyled: { borderRadius: 16 },
  pill: { borderRadius: 999 },
  pixelLive: { backgroundColor: '#b3261e', paddingHorizontal: 8 },
  nothingLive: { backgroundColor: '#000c', paddingHorizontal: 8 },
  nothingMono: { fontFamily: 'Doto-Bold', fontWeight: 'normal', letterSpacing: 1 },
  nothingCount: { fontFamily: 'Doto-Bold', fontWeight: 'normal', letterSpacing: 0.5 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 48 },
  footer: { fontSize: 13, marginTop: 8, marginHorizontal: 16, lineHeight: 18 }
})
