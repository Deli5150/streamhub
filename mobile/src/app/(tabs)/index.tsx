import { useMemo, useState } from 'react'
import { FlatList, Platform as OS, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Icon } from '../../ui/Icon'
import { PLATFORMS, type SavedItem } from '@shared/types'
import { buildLiveRows, type DisplayRow } from '../../../../src/renderer/src/lib/combined'
import { actions, useApp } from '../../lib/hub'
import { useQueue } from '../../lib/queue'
import { savedTitle, useUi } from '../../lib/ui'
import { downloadUpdate, installUpdate } from '../../lib/updater'
import { openChannel, openChannelMenu } from '../../ui/channelMenu'
import { Button, Chip, useDockSpace, EmptyState, LiveCard, PlatformChip, SectionHeader, Thumbnail } from '../../ui/components'
import { displayFont, useColors } from '../../ui/theme'
import { WallpaperScreen } from '../../ui/WallpaperScreen'

/** Home: everyone you follow who's live, biggest first, with Watch Later along the top. */
export default function LiveScreen(): React.JSX.Element {
  return (
    <WallpaperScreen>
      <LiveList />
    </WallpaperScreen>
  )
}

function LiveList(): React.JSX.Element {
  const app = useApp((s) => s.app)!
  const queue = useQueue((s) => s.items)
  const { filter, setFilter } = useUi()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const c = useColors()
  const insets = useSafeAreaInsets()
  const dockSpace = useDockSpace()
  const { width } = useWindowDimensions()
  // Landscape phones and tablets get a grid.
  const columns = width >= 1000 ? 3 : width >= 640 ? 2 : 1

  const live = useMemo(
    () => app.channels.filter((ch) => app.live[ch.key]).sort((a, b) => (app.live[b.key].viewers ?? 0) - (app.live[a.key].viewers ?? 0)),
    [app]
  )
  const q = search.trim().toLowerCase()
  const rows = buildLiveRows(
    live.filter((ch) => (filter === 'all' || ch.platform === filter) && (!q || ch.displayName.toLowerCase().includes(q))),
    app.channels,
    app.live,
    app.settings.combined
  )
  const connected = app.accounts.some((a) => a.connected)
  const followedPlatforms = PLATFORMS.filter((p) => app.channels.some((ch) => ch.platform === p))

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    await actions.refresh().finally(() => setRefreshing(false))
  }

  const header = (
    <View>
      <View style={[styles.titleRow, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.title, { color: c.fg }, displayFont(c)]}>Live</Text>
        {app.syncing.length > 0 ? <Text style={{ color: c.fg3 }}>Syncing…</Text> : null}
      </View>
      {connected ? (
        <>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search live channels"
            placeholderTextColor={c.fg3}
            clearButtonMode="while-editing"
            style={[styles.search, { backgroundColor: c.bg2, color: c.fg }]}
          />
          {followedPlatforms.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip label={`All ${live.length}`} active={filter === 'all'} onPress={() => setFilter('all')} />
              {followedPlatforms.map((p) => (
                <PlatformChip key={p} platform={p} active={filter === p} onPress={() => setFilter(filter === p ? 'all' : p)} />
              ))}
            </ScrollView>
          ) : null}
          <UpdateBanner />
          {/* One playlist: its videos in a row. More: a grid of them, each opening its own page. */}
          {(app.watchLater.length ? 1 : 0) + (queue.length ? 1 : 0) + app.ytPlaylists.length > 1 ? (
            <PlaylistGrid />
          ) : (
            <>
              <WatchLaterStrip items={app.watchLater} />
              <WatchLaterStrip items={queue} queue />
              <PlaylistsStrip />
            </>
          )}
          {(app.watchLater.length > 0 || queue.length > 0 || app.ytPlaylists.length > 0) && rows.length > 0 ? (
            <SectionHeader title="Live now" right={<Text style={{ color: c.fg3 }}>{rows.length}</Text>} />
          ) : null}
        </>
      ) : null}
    </View>
  )

  const rowChannel = (r: DisplayRow) => (r.kind === 'group' ? r.display : r.channel)
  const rowPlay = (r: DisplayRow) => (r.kind === 'group' ? r.playChannel : r.channel)

  return (
    <FlatList
      key={columns}
      data={rows}
      numColumns={columns}
      keyExtractor={(r) => r.key}
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + dockSpace, flexGrow: 1 }}
      initialNumToRender={8}
      windowSize={9}
      removeClippedSubviews
      columnWrapperStyle={columns > 1 ? { gap: 16, paddingHorizontal: 16 } : undefined}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.fg3} />}
      renderItem={({ item: r }) => (
        <View style={columns > 1 ? { flex: 1 / columns, marginBottom: 20 } : { paddingHorizontal: 16, marginBottom: 14 }}>
          <LiveCard
            compact={columns === 1}
            channel={rowChannel(r)}
            live={r.live}
            platforms={r.kind === 'group' ? r.platforms : undefined}
            onPress={() => openChannel(rowPlay(r).key)}
            onLongPress={() => openChannelMenu(rowChannel(r))}
          />
        </View>
      )}
      ListEmptyComponent={
        !connected ? (
          <EmptyState
            icon="tv-outline"
            title="Welcome to StreamHub"
            text="Sign in to Twitch, YouTube, Kick and Rumble to see everyone you follow in one place."
            action={<Button title="Connect accounts" variant="accent" onPress={() => router.navigate('/settings')} />}
          />
        ) : (
          <EmptyState
            icon="moon-outline"
            title={q || filter !== 'all' ? 'No matches' : 'Nobody’s live'}
            text={q || filter !== 'all' ? 'Try another search or platform.' : 'Channels you follow show up here when they go live. Pull down to refresh.'}
          />
        )
      }
    />
  )
}

/**
 * Watch Later (or the queue) along the top of Live (the desktop's Cover Flow). Tap to open the
 * playlist there.
 */
function WatchLaterStrip({ items, queue }: { items: SavedItem[]; queue?: boolean }): React.JSX.Element | null {
  const c = useColors()
  const live = useApp((s) => s.app?.live)
  if (!items.length) return null
  const source = queue ? { queue: '1' } : {}
  return (
    <View>
      <SectionHeader
        title={queue ? 'Queue' : 'Watch Later'}
        right={<Button title="Play all" variant="plain" onPress={() => router.push({ pathname: '/playlist', params: source })} />}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
        {items.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => router.push({ pathname: '/playlist', params: { ...source, start: item.id } })}
            style={{ width: 200 }}
            accessibilityRole="button"
          >
            <Thumbnail uri={item.thumbnail}>
              {item.kind === 'channel' && live?.[item.channelKey] ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>LIVE</Text>
                </View>
              ) : item.media?.durationText ? (
                <View style={[styles.badge, { backgroundColor: '#000a', left: undefined, right: 6 }]}>
                  <Text style={styles.badgeText}>{item.media.durationText}</Text>
                </View>
              ) : null}
            </Thumbnail>
            <Text numberOfLines={2} style={{ color: c.fg, fontSize: 13, fontWeight: '600', marginTop: 6 }}>
              {savedTitle(item)}
            </Text>
            <Text numberOfLines={1} style={{ color: c.fg3, fontSize: 12 }}>
              {item.displayName}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}

/**
 * Watch Later, the queue and the imported YouTube playlists as a grid of tiles, once there's more than one
 * (rows of each would stack up). A tile opens the playlist's page (app/playlist-info.tsx), which
 * shows its videos before anything plays.
 */
function PlaylistGrid(): React.JSX.Element {
  const c = useColors()
  const watchLater = useApp((s) => s.app?.watchLater ?? [])
  const playlists = useApp((s) => s.app?.ytPlaylists ?? [])
  const queue = useQueue((s) => s.items)
  const { width } = useWindowDimensions()
  const columns = width >= 1000 ? 4 : width >= 640 ? 3 : 2
  const tileWidth = (width - 32 - 12 * (columns - 1)) / columns
  const tiles = [
    ...(watchLater.length ? [{ key: 'watchLater', title: 'Watch Later', thumbnail: watchLater[0].thumbnail, count: watchLater.length, icon: 'bookmark' as const, params: {} }] : []),
    ...(queue.length ? [{ key: 'queue', title: 'Queue', thumbnail: queue[0].thumbnail, count: queue.length, icon: 'play-skip-forward' as const, params: { queue: '1' } }] : []),
    ...playlists.map((p) => ({ key: p.id, title: p.title, thumbnail: p.thumbnail ?? p.items[0]?.thumbnail, count: p.items.length, icon: 'list' as const, params: { yt: p.id } }))
  ]
  return (
    <View>
      <SectionHeader title="Playlists" />
      <View style={styles.grid}>
        {tiles.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => router.push({ pathname: '/playlist-info', params: t.params })}
            style={({ pressed }) => [{ width: tileWidth }, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`${t.title}, ${t.count} videos`}
          >
            <Thumbnail uri={t.thumbnail}>
              <View style={styles.count}>
                <Icon name={t.icon} size={16} color="#fff" />
                <Text style={styles.badgeText}>{t.count}</Text>
              </View>
            </Thumbnail>
            <Text numberOfLines={1} style={{ color: c.fg, fontSize: 13, fontWeight: '600', marginTop: 6 }}>
              {t.title}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

/** Imported YouTube playlists (Settings → YouTube playlists), under Watch Later. */
function PlaylistsStrip(): React.JSX.Element | null {
  const c = useColors()
  const playlists = useApp((s) => s.app?.ytPlaylists)
  if (!playlists?.length) return null
  return (
    <View>
      <SectionHeader title="Your playlists" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
        {playlists.map((p) => (
          <Pressable
            key={p.id}
            disabled={!p.items.length}
            onPress={() => router.push({ pathname: '/playlist', params: { yt: p.id } })}
            style={{ width: 170, opacity: p.items.length ? 1 : 0.5 }}
            accessibilityRole="button"
          >
            <Thumbnail uri={p.thumbnail}>
              <View style={styles.count}>
                <Icon name="list" size={16} color="#fff" />
                <Text style={styles.badgeText}>{p.items.length}</Text>
              </View>
            </Thumbnail>
            <Text numberOfLines={1} style={{ color: c.fg, fontSize: 13, fontWeight: '600', marginTop: 6 }}>
              {p.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}

/** A new version of StreamHub: Android updates from here; an iPhone downloads it to save and sideload. */
function UpdateBanner(): React.JSX.Element | null {
  const c = useColors()
  const u = useApp((s) => s.app?.update)
  if (!u?.version || !['available', 'downloading', 'ready'].includes(u.state)) return null
  const label =
    u.state === 'downloading' ? `Downloading… ${Math.round((u.progress ?? 0) * 100)}%` : u.state === 'ready'
        ? OS.OS === 'ios'
          ? 'Save'
          : 'Install'
        : u.inApp
          ? OS.OS === 'ios'
            ? 'Download'
            : 'Update'
          : 'Get it'
  return (
    <View style={[styles.banner, { backgroundColor: c.bg2 }]}>
      <Icon name="arrow-up-circle" size={22} color={c.accent} />
      <Text style={{ color: c.fg, flex: 1, fontSize: 14 }}>StreamHub {u.version} is available.</Text>
      <Button
        title={label}
        variant="accent"
        disabled={u.state === 'downloading'}
        onPress={() => (u.state === 'ready' ? installUpdate() : void downloadUpdate())}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 12
  },
  count: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '38%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: '#000a'
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: 32, fontWeight: '800' },
  search: { marginHorizontal: 16, height: 38, borderRadius: 10, paddingHorizontal: 12, fontSize: 16 },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  badge: { position: 'absolute', top: 6, left: 6, backgroundColor: '#eb0400', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' }
})
