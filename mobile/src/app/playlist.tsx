import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import * as Linking from 'expo-linking'
import { Ionicons } from '@expo/vector-icons'
import { PLATFORM_LABEL, type SavedItem } from '@shared/types'
import { embedUrl } from '@shared/urls'
import { actions, useApp } from '../lib/hub'
import { progressKey, resumePosition, savedTitle, useVodProgress } from '../lib/ui'
import { IconButton, Thumbnail } from '../ui/components'
import { FloatingButton, HomeButton } from '../ui/HomeButton'
import { CastButton } from '../ui/CastButton'
import { showMenu } from '../ui/Menu'
import { useAutoPip, usePipActive } from '../ui/pip'
import { Player, type PlayerHandle } from '../ui/Player'
import { useColors } from '../ui/theme'

/**
 * Watch Later and imported YouTube playlists (`yt`: its id), like the desktop's PlaylistView: the
 * selected item plays at the top and the playlist sits underneath. Finished videos move on to the
 * next item. Press and hold a Watch Later item to reorder or remove it; imported playlists are
 * read-only (refresh them from YouTube).
 */
const NO_ITEMS: SavedItem[] = []

export default function PlaylistScreen(): React.JSX.Element | null {
  const { start, yt } = useLocalSearchParams<{ start?: string; yt?: string }>()
  const c = useColors()
  const insets = useSafeAreaInsets()
  const imported = useApp((s) => (yt ? s.app?.ytPlaylists.find((p) => p.id === yt) : undefined))
  const watchLater = useApp((s) => s.app?.watchLater ?? NO_ITEMS)
  const items = yt ? (imported?.items ?? NO_ITEMS) : watchLater
  const [refreshing, setRefreshing] = useState(false)
  const [pickedId, setPickedId] = useState<string | null>(start ?? null)
  // The picked item, or the first one if it was removed.
  const activeId = items.some((i) => i.id === pickedId) ? pickedId : (items[0]?.id ?? null)
  const player = useRef<PlayerHandle>(null)
  // Android picture-in-picture: only the player shows, filling the small window.
  const inPip = usePipActive()
  const pipHidden = inPip ? styles.hidden : null
  useAutoPip(items.length > 0)

  useEffect(() => {
    if (items.length === 0) router.back()
  }, [items.length])

  const index = items.findIndex((i) => i.id === activeId)
  const active = items[index] ?? items[0]
  const playNext = useCallback(() => {
    const next = items[index + 1]
    if (next) setPickedId(next.id)
  }, [items, index])
  if (!active) return null

  const itemMenu = (item: SavedItem, i: number): void =>
    showMenu(
      savedTitle(item),
      yt
        ? [
            { label: 'Play', icon: 'play-outline', onSelect: () => setPickedId(item.id) },
            {
              label: 'Open on YouTube',
              icon: 'open-outline',
              onSelect: () => void Linking.openURL(`https://www.youtube.com/watch?v=${item.media?.id}&list=${yt}`)
            }
          ]
        : [
            { label: 'Play', icon: 'play-outline', onSelect: () => setPickedId(item.id) },
            { label: 'Move up', icon: 'arrow-up', disabled: i === 0, onSelect: () => actions.saved.reorder(item.id, items[i - 1].id) },
            { label: 'Move down', icon: 'arrow-down', disabled: i === items.length - 1, onSelect: () => actions.saved.reorder(item.id, items[i + 1].id) },
            { label: 'Remove from Watch Later', icon: 'trash-outline', destructive: true, onSelect: () => actions.saved.remove(item.id) }
          ]
    )
  const refresh = (): void => {
    if (!yt) return
    setRefreshing(true)
    actions.playlists
      .refresh(yt)
      .catch(() => {})
      .finally(() => setRefreshing(false))
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[{ paddingTop: inPip ? 0 : insets.top, backgroundColor: '#000' }, inPip && { flex: 1 }]}>
        <PlaylistPlayer key={active.id} item={active} playerRef={player} onEnded={playNext} />
        <View style={[styles.back, { top: insets.top + 4 }, pipHidden]}>
          <FloatingButton icon="chevron-down" label="Close" onPress={() => router.back()} />
          <HomeButton />
        </View>
      </View>
      <View style={[styles.nowPlaying, { borderBottomColor: c.separator }, pipHidden]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={{ color: c.fg, fontWeight: '700', fontSize: 15 }}>
            {savedTitle(active)}
          </Text>
          <Text style={{ color: c.fg3, fontSize: 12 }}>
            {yt ? `${imported?.title ?? 'Playlist'} · ${active.displayName}` : `${active.displayName} · ${PLATFORM_LABEL[active.platform]}`} · {index + 1} of{' '}
            {items.length}
          </Text>
        </View>
        <IconButton icon="play-skip-back" label="Previous" onPress={() => index > 0 && setPickedId(items[index - 1].id)} />
        <IconButton icon="play-skip-forward" label="Next" onPress={playNext} />
        {yt ? <IconButton icon={refreshing ? 'hourglass-outline' : 'refresh'} label="Refresh from YouTube" onPress={refresh} /> : null}
        <CastButton />
        <IconButton icon="albums-outline" label="Picture in picture" onPress={() => player.current?.pip()} />
      </View>
      <FlatList
        style={pipHidden}
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        renderItem={({ item, index: i }) => {
          const on = item.id === active.id
          return (
            <Pressable
              onPress={() => setPickedId(item.id)}
              onLongPress={() => itemMenu(item, i)}
              style={({ pressed }) => [styles.row, { backgroundColor: on ? c.bg2 : pressed ? c.card : 'transparent' }]}
              accessibilityRole="button"
            >
              <Text style={{ color: on ? c.accent : c.fg3, width: 22, textAlign: 'center', fontSize: 12 }}>{on ? '▶' : i + 1}</Text>
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
                <Ionicons name="ellipsis-vertical" size={18} color={c.fg3} />
              </Pressable>
            </Pressable>
          )
        }}
      />
    </View>
  )
}

/** A saved video (resuming and saving progress), or a saved channel's stream while it's live. */
function PlaylistPlayer({
  item,
  playerRef,
  onEnded
}: {
  item: SavedItem
  playerRef: React.RefObject<PlayerHandle | null>
  onEnded(): void
}): React.JSX.Element {
  const app = useApp((s) => s.app)!
  const save = useVodProgress((s) => s.save)
  const key = item.media ? progressKey(item.platform, item.media.id) : ''
  const [startAt] = useState(() => (key ? resumePosition(key) : 0))
  // 16:9 by width, in picture-in-picture too (see styles.pipSafe on the Watch screen).
  const box = { width: '100%' as const, aspectRatio: 16 / 9 }
  const url = item.media?.playUrl ?? item.media?.hlsUrl
  if (url) {
    return (
      <Player
        ref={playerRef}
        platform={item.platform}
        url={url}
        hls={!item.media?.playUrl}
        resumeAt={startAt}
        onProgress={(t, d) => save(key, t, d)}
        onEnded={onEnded}
        style={box}
      />
    )
  }
  const channel = app.channels.find((ch) => ch.key === item.channelKey)
  const live = app.live[item.channelKey]
  const liveUrl = channel && live ? embedUrl(channel, live) : null
  if (channel && liveUrl) return <Player ref={playerRef} key={liveUrl} platform={channel.platform} url={liveUrl} style={box} />
  return (
    <View style={[box, styles.offline]}>
      <Ionicons name="radio-outline" size={36} color="#fff6" />
      <Text style={{ color: '#fffd', textAlign: 'center' }}>{item.displayName} isn’t live right now.</Text>
      <Text style={{ color: '#fff9', textAlign: 'center', fontSize: 12 }}>
        {item.kind === 'channel'
          ? `This entry turns into the stream’s recording once ${PLATFORM_LABEL[item.platform]} publishes it.`
          : 'This video can’t be played here.'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  back: { position: 'absolute', left: 10, flexDirection: 'row', gap: 8 },
  nowPlaying: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 },
  hidden: { display: 'none' },
  offline: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24 }
})
