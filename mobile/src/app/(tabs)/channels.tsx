import { useMemo, useState } from 'react'
import { ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { PLATFORMS, PLATFORM_LABEL, type Channel, type Platform } from '@shared/types'
import { groupOf } from '../../../../src/renderer/src/lib/combined'
import { useApp } from '../../lib/hub'
import { openChannel, openChannelMenu } from '../../ui/channelMenu'
import { ChannelRow, Chip, DOCK_SPACE, EmptyState, PlatformChip } from '../../ui/components'
import { PLATFORM_COLOR, useColors } from '../../ui/theme'
import { WallpaperScreen } from '../../ui/WallpaperScreen'

/** Every followed channel, by platform; live ones first. */
export default function ChannelsScreen(): React.JSX.Element {
  return (
    <WallpaperScreen>
      <ChannelList />
    </WallpaperScreen>
  )
}

function ChannelList(): React.JSX.Element {
  const app = useApp((s) => s.app)!
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Platform | 'all'>('all')
  const c = useColors()
  const insets = useSafeAreaInsets()
  const q = search.trim().toLowerCase()
  const followedPlatforms = PLATFORMS.filter((p) => app.channels.some((ch) => ch.platform === p))

  const sections = useMemo(
    () =>
      PLATFORMS.filter((p) => filter === 'all' || p === filter)
        .map((p) => ({
          platform: p,
          data: app.channels
            .filter((ch) => ch.platform === p && (!q || ch.displayName.toLowerCase().includes(q) || ch.id.toLowerCase().includes(q)))
            .sort((a, b) => Number(Boolean(app.live[b.key])) - Number(Boolean(app.live[a.key])) || a.displayName.localeCompare(b.displayName))
        }))
        .filter((s) => s.data.length),
    [app, q, filter]
  )

  const groupPlatforms = (ch: Channel) => groupOf(app.settings.combined, ch.key)?.memberKeys.map((k) => k.split(':')[0] as Channel['platform'])

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 8 }}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: c.fg }]}>Channels</Text>
        <Text style={{ color: c.fg3 }}>{app.channels.length}</Text>
      </View>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search channels"
        placeholderTextColor={c.fg3}
        clearButtonMode="while-editing"
        style={[styles.search, { backgroundColor: c.bg2, color: c.fg }]}
      />
      {followedPlatforms.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.noGrow} contentContainerStyle={styles.chips}>
          <Chip label={`All ${app.channels.length}`} active={filter === 'all'} onPress={() => setFilter('all')} />
          {followedPlatforms.map((p) => (
            <PlatformChip key={p} platform={p} active={filter === p} onPress={() => setFilter(filter === p ? 'all' : p)} />
          ))}
        </ScrollView>
      ) : null}
      <SectionList
        sections={sections}
        keyExtractor={(ch) => ch.key}
        stickySectionHeadersEnabled
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: insets.bottom + DOCK_SPACE, flexGrow: 1 }}
        initialNumToRender={20}
        windowSize={11}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: c.overWallpaper ? 'transparent' : c.bg }]}>
            <View style={[styles.sectionPill, c.overWallpaper && { backgroundColor: c.card }]}>
              <View style={[styles.dot, { backgroundColor: PLATFORM_COLOR[section.platform] }]} />
              <Text style={{ color: c.fg, fontWeight: '700', fontSize: 15 }}>{PLATFORM_LABEL[section.platform]}</Text>
              <Text style={{ color: c.fg3 }}>{section.data.length}</Text>
            </View>
          </View>
        )}
        renderItem={({ item }) => (
          <ChannelRow
            channel={item}
            live={app.live[item.key]}
            platforms={groupPlatforms(item)}
            onPress={() => openChannel(item.key)}
            onLongPress={() => openChannelMenu(item)}
            right={app.muted.includes(item.key) ? <Ionicons name="notifications-off-outline" size={16} color={c.fg3} /> : null}
          />
        )}
        ListEmptyComponent={
          <EmptyState icon="people-outline" title={q || filter !== 'all' ? 'No matches' : 'No channels yet'} text={q || filter !== 'all' ? undefined : 'Connect an account in Settings and the channels you follow appear here.'} />
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: 32, fontWeight: '800' },
  search: { marginHorizontal: 16, height: 38, borderRadius: 10, paddingHorizontal: 12, fontSize: 16 },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  // A ScrollView otherwise grows to share the screen's free space with the list.
  noGrow: { flexGrow: 0 },
  sectionHeader: { paddingHorizontal: 10, paddingVertical: 4 },
  sectionPill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 }
})
