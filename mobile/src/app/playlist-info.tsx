import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import * as Linking from 'expo-linking'
import { type SavedItem } from '@shared/types'
import { actions, useApp } from '../lib/hub'
import { useQueue } from '../lib/queue'
import { savedTitle } from '../lib/ui'
import { Button, EmptyState, Thumbnail } from '../ui/components'
import { FloatingButton, HomeButton } from '../ui/HomeButton'
import { Icon } from '../ui/Icon'
import { showMenu } from '../ui/Menu'
import { displayFont, useColors } from '../ui/theme'

/**
 * A playlist's page, opened from Home's playlist grid: Watch Later, the queue (`queue`), or an
 * imported YouTube playlist (`yt`: its id). It shows what's in the playlist before anything plays: Play starts from the top,
 * or tap a video to start there (in the playlist player, app/playlist.tsx).
 */
const NO_ITEMS: SavedItem[] = []

export default function PlaylistInfoScreen(): React.JSX.Element {
  const { yt, queue } = useLocalSearchParams<{ yt?: string; queue?: string }>()
  const c = useColors()
  const insets = useSafeAreaInsets()
  const imported = useApp((s) => (yt ? s.app?.ytPlaylists.find((p) => p.id === yt) : undefined))
  const watchLater = useApp((s) => s.app?.watchLater ?? NO_ITEMS)
  const queued = useQueue((s) => s.items)
  const items = queue ? queued : yt ? (imported?.items ?? NO_ITEMS) : watchLater
  const title = queue ? 'Queue' : yt ? (imported?.title ?? 'Playlist') : 'Watch Later'
  const cover = yt ? (imported?.thumbnail ?? items[0]?.thumbnail) : items[0]?.thumbnail
  const [refreshing, setRefreshing] = useState(false)

  const play = (start?: string): void =>
    router.push({ pathname: '/playlist', params: { ...(yt ? { yt } : {}), ...(queue ? { queue: '1' } : {}), ...(start ? { start } : {}) } })
  const refresh = (): void => {
    if (!yt) return
    setRefreshing(true)
    actions.playlists
      .refresh(yt)
      .catch(() => {})
      .finally(() => setRefreshing(false))
  }
  const itemMenu = (item: SavedItem, i: number): void =>
    showMenu(
      savedTitle(item),
      queue
        ? [
            { label: 'Play from here', icon: 'play-outline', onSelect: () => play(item.id) },
            { label: 'Move up', icon: 'arrow-up', disabled: i === 0, onSelect: () => useQueue.getState().reorder(item.id, items[i - 1].id) },
            { label: 'Move down', icon: 'arrow-down', disabled: i === items.length - 1, onSelect: () => useQueue.getState().reorder(item.id, items[i + 1].id) },
            { label: 'Remove from queue', icon: 'trash-outline', destructive: true, onSelect: () => useQueue.getState().remove(item.id) }
          ]
        : yt
        ? [
            { label: 'Play from here', icon: 'play-outline', onSelect: () => play(item.id) },
            { label: 'Open on YouTube', icon: 'open-outline', onSelect: () => void Linking.openURL(`https://www.youtube.com/watch?v=${item.media?.id}&list=${yt}`) }
          ]
        : [
            { label: 'Play from here', icon: 'play-outline', onSelect: () => play(item.id) },
            { label: 'Move up', icon: 'arrow-up', disabled: i === 0, onSelect: () => actions.saved.reorder(item.id, items[i - 1].id) },
            { label: 'Move down', icon: 'arrow-down', disabled: i === items.length - 1, onSelect: () => actions.saved.reorder(item.id, items[i + 1].id) },
            { label: 'Remove from Watch Later', icon: 'trash-outline', destructive: true, onSelect: () => actions.saved.remove(item.id) }
          ]
    )

  const header = (
    <View>
      <Thumbnail uri={cover} style={styles.cover} />
      <View style={styles.headerText}>
        <Text style={[styles.title, { color: c.fg }, displayFont(c)]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={{ color: c.fg3, fontSize: 13 }}>
          {queue ? 'Plays one after another' : yt ? 'YouTube playlist' : 'Saved in StreamHub'} · {items.length} {items.length === 1 ? 'video' : 'videos'}
        </Text>
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <Button title="Play" icon="play" variant="accent" disabled={!items.length} onPress={() => play()} />
          </View>
          {yt ? <Button title="Refresh" icon="refresh" variant="filled" busy={refreshing} onPress={refresh} /> : null}
          {queue && items.length ? <Button title="Clear" icon="trash-outline" variant="filled" onPress={() => useQueue.getState().clear()} /> : null}
        </View>
      </View>
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingTop: insets.top + 56, paddingBottom: insets.bottom + 16 }}
        ListEmptyComponent={<EmptyState icon="list" title="Nothing here yet" text={
              queue
                ? 'Line up videos to play one after another: press and hold a video on a channel page, then Add to queue.'
                : yt
                  ? 'This playlist has no videos StreamHub can play.'
                  : 'Save videos and streams to watch them later.'
            } />}
        renderItem={({ item, index: i }) => (
          <Pressable
            onPress={() => play(item.id)}
            onLongPress={() => itemMenu(item, i)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.card }]}
            accessibilityRole="button"
            accessibilityLabel={`Play ${savedTitle(item)}`}
          >
            <Text style={{ color: c.fg3, width: 22, textAlign: 'center', fontSize: 12 }}>{i + 1}</Text>
            <Thumbnail uri={item.thumbnail} style={{ width: 120, borderRadius: 6 }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={2} style={{ color: c.fg, fontWeight: '600', fontSize: 13 }}>
                {savedTitle(item)}
              </Text>
              <Text numberOfLines={1} style={{ color: c.fg3, fontSize: 12 }}>
                {item.displayName}
                {item.kind === 'channel' ? ' · Live stream' : item.media?.durationText ? ` · ${item.media.durationText}` : ''}
              </Text>
            </View>
            <Pressable onPress={() => itemMenu(item, i)} hitSlop={8} accessibilityLabel="More">
              <Icon name="ellipsis-vertical" size={18} color={c.fg3} />
            </Pressable>
          </Pressable>
        )}
      />
      <View style={[styles.back, { top: insets.top + 6 }]}>
        <FloatingButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <HomeButton />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  cover: { marginHorizontal: 16, borderRadius: 14 },
  headerText: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 4 },
  title: { fontSize: 26, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 },
  back: { position: 'absolute', left: 10, flexDirection: 'row', gap: 8 }
})
