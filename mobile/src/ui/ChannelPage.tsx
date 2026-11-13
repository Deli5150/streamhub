import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { Stack, router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { PLATFORM_LABEL, type Channel, type ChannelPageData, type LiveInfo, type MediaCategory, type MediaItem, type Platform } from '@shared/types'
import { channelPageUrl } from '@shared/urls'
import { groupOf } from '../../../src/renderer/src/lib/combined'
import { onChannelPage } from '../lib/channelPages'
import { addToQueue, useQueue } from '../lib/queue'
import { actions, useApp } from '../lib/hub'
import { progressFraction, progressKey, resumePosition, savedVideo, useVodProgress } from '../lib/ui'
import { openChannel, openChannelMenu } from './channelMenu'
import { Avatar, Button, centered, Chip, EmptyState, IconButton, Thumbnail } from './components'
import { showMenu } from './Menu'
import { useAutoPip, useLayoutWindow, usePipActive } from './pip'
import { Player, type PlayerHandle } from './Player'
import { FloatingButton, HomeButton } from './HomeButton'
import { CastButton } from './CastButton'
import { PLATFORM_COLOR, displayFont, errorMessage, useColors } from './theme'

// A channel's page (the desktop's ChannelPage): banner, past streams / uploads / clips in tabs, and
// a player at the top for whatever you pick. Opens instantly from the saved copy. The list is a
// FlashList (rows are recycled, so it stays smooth as more videos load in), the player stays put
// above it while it plays, and the back and home buttons stay in the top-left corner throughout.

const REFRESH_MS = 5 * 60_000
const PLATFORM_TABS: Record<Platform, Pick<ChannelPageData, 'hasVideos' | 'clipsLabel'>> = {
  twitch: { hasVideos: false, clipsLabel: 'Clips' },
  youtube: { hasVideos: true, clipsLabel: 'Shorts' },
  kick: { hasVideos: false, clipsLabel: 'Clips' },
  rumble: { hasVideos: true, clipsLabel: null }
}
type ClipWindow = 'all' | 'day' | 'week' | 'month'
const CLIP_WINDOW_MS: Record<Exclude<ClipWindow, 'all'>, number> = { day: 864e5, week: 7 * 864e5, month: 30 * 864e5 }
const CLIP_WINDOW_LABEL: Record<ClipWindow, string> = { all: 'All time', day: 'Past day', week: 'Past week', month: 'Past month' }

export function ChannelPage({ channel, live }: { channel: Channel; live?: LiveInfo }): React.JSX.Element {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const { width, height } = useLayoutWindow()
  // Android picture-in-picture: only the player shows, filling the small window.
  const inPip = usePipActive()
  const list = useRef<FlashListRef<MediaItem>>(null)
  const app = useApp((s) => s.app)!
  const [page, setPage] = useState<ChannelPageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<MediaCategory>('streams')
  // Set once you pick a tab, so the page never switches tabs on you after that.
  const pickedTab = useRef(false)
  const [playing, setPlaying] = useState<MediaItem | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [clipSort, setClipSort] = useState<'newest' | 'oldest'>('newest')
  const [clipWindow, setClipWindow] = useState<ClipWindow>('all')
  // Clip windows count back from when one was picked.
  const [clipNow, setClipNow] = useState(() => Date.now())
  const player = useRef<PlayerHandle>(null)
  useAutoPip(Boolean(playing))
  // Turned sideways while a video plays, the video fills the screen (16:9 at the full width would be
  // taller than the screen, cutting it off); the list is back in portrait.
  const fill = Boolean(playing) && width > height && !inPip
  const queue = useQueue((s) => s.items)
  const queuedIds = useMemo(() => new Set(queue.map((i) => i.id)), [queue])
  // Back while a video plays closes it, back to the channel, rather than leaving the channel.
  const back = (): void => (playing ? setPlaying(null) : router.back())
  useEffect(() => {
    if (!playing) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setPlaying(null)
      return true
    })
    return () => sub.remove()
  }, [playing])
  const columns = width >= 900 ? 4 : width >= 600 ? 3 : 2

  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      actions.getChannelPage(channel.key).then(
        (p) => !cancelled && setPage((prev) => (prev ? { ...p, ...mergeLoaded(prev, p) } : p)),
        (e) => !cancelled && setError(errorMessage(e))
      )
    }
    load()
    const timer = setInterval(load, REFRESH_MS)
    const off = onChannelPage((key, fresh) => {
      if (key === channel.key && !cancelled) setPage((prev) => (prev ? { ...fresh, ...mergeLoaded(prev, fresh) } : fresh))
    })
    return () => {
      cancelled = true
      clearInterval(timer)
      off()
    }
  }, [channel.key])

  // A channel with no past streams opens on its videos, or else its clips (Twitch, Kick) or Shorts.
  useEffect(() => {
    if (pickedTab.current || !page || page.streams.length > 0) return
    // Once, when the channel's page arrives (the first tab depends on what it has).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (page.hasVideos && page.videos.length > 0) setTab('videos')
    else if (page.clipsLabel && page.clips.length > 0) setTab('clips')
  }, [page])

  // Guards against asking twice while a batch is on its way (state updates land a frame later).
  const loadingRef = useRef(false)
  const loadMore = async (): Promise<void> => {
    const cursor = page?.cursors[tab]
    if (!cursor || loadingRef.current) return
    loadingRef.current = true
    setLoadingMore(true)
    try {
      const res = await actions.loadMore(channel.key, tab, cursor)
      setPage((p) => {
        if (!p) return p
        const seen = new Set(p[tab].map((m) => m.id))
        return { ...p, [tab]: [...p[tab], ...res.items.filter((m) => !seen.has(m.id))], cursors: { ...p.cursors, [tab]: res.cursor } }
      })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      loadingRef.current = false
      setLoadingMore(false)
    }
  }

  const clips = useMemo(() => {
    if (!page) return []
    const ts = (m: MediaItem): number => (m.publishedAt ? Date.parse(m.publishedAt) : NaN)
    const windowed = clipWindow === 'all' ? page.clips : page.clips.filter((m) => clipNow - ts(m) <= CLIP_WINDOW_MS[clipWindow])
    return [...windowed].sort((a, b) => {
      const ta = ts(a)
      const tb = ts(b)
      if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.isNaN(ta) ? 1 : Number.isNaN(tb) ? -1 : 0
      return clipSort === 'newest' ? tb - ta : ta - tb
    })
  }, [page, clipSort, clipWindow, clipNow])

  const group = groupOf(app.settings.combined, channel.key)
  const members = group ? group.memberKeys.map((k) => app.channels.find((ch) => ch.key === k)).filter((ch): ch is Channel => Boolean(ch)) : []
  const { hasVideos, clipsLabel } = page ?? PLATFORM_TABS[channel.platform]
  const tabs: { id: MediaCategory; label: string }[] = [
    { id: 'streams', label: 'Past streams' },
    ...(hasVideos ? [{ id: 'videos' as const, label: 'Videos' }] : []),
    ...(clipsLabel ? [{ id: 'clips' as const, label: clipsLabel }] : [])
  ]
  const items = tab === 'clips' ? clips : (page?.[tab] ?? [])
  const portrait = tab === 'clips' && clipsLabel === 'Shorts'
  const saving = useVodProgress((s) => s.save)

  // Stable across renders, so cards don't redraw when more videos load in.
  const latest = useRef({ app, channel })
  useEffect(() => {
    latest.current = { app, channel }
  })
  const play = useCallback((m: MediaItem) => setPlaying(m), [])
  const videoMenu = useCallback((m: MediaItem): void => {
    const { app: a, channel: ch } = latest.current
    const item = savedVideo(ch, m)
    const saved = a.watchLater.some((i) => i.id === item.id)
    const queued = useQueue.getState().items.some((i) => i.id === item.id)
    showMenu(m.title, [
      { label: 'Play', icon: 'play-outline', onSelect: () => setPlaying(m) },
      { label: saved ? 'Remove from Watch Later' : 'Watch Later', icon: saved ? 'bookmark' : 'bookmark-outline', onSelect: () => actions.saved.toggle(savedVideo(ch, m)) },
      queued
        ? { label: 'Remove from queue', icon: 'remove-circle-outline', onSelect: () => useQueue.getState().remove(item.id) }
        : { label: 'Add to queue', icon: 'add-circle-outline', onSelect: () => addToQueue(item) }
    ])
  }, [])

  // The player stays at the top while it plays; the list scrolls under it.
  const playerArea = playing ? (
    <View
      style={[
        { paddingTop: inPip ? 0 : insets.top, backgroundColor: '#000' },
        inPip && { flex: 1 },
        fill && { flex: 1, paddingTop: 0, ...centered(insets) }
      ]}
    >
      <Player
        ref={player}
        key={playing.id}
        platform={channel.platform}
        url={playing.playUrl ?? playing.hlsUrl ?? ''}
        hls={!playing.playUrl && Boolean(playing.hlsUrl)}
        resumeAt={resumePosition(progressKey(channel.platform, playing.id))}
        onProgress={(t, d) => saving(progressKey(channel.platform, playing.id), t, d)}
        castInfo={{ title: playing.title, subtitle: channel.displayName, thumbnail: playing.thumbnail }}
        // 16:9 by width, in picture-in-picture too (see styles.pipSafe on the Watch screen).
        style={fill ? { flex: 1 } : { aspectRatio: 16 / 9, width: '100%' }}
      />
      <View style={[styles.playingBar, { backgroundColor: c.bg, borderBottomColor: c.separator }, (inPip || fill) && styles.hidden]}>
        <Text numberOfLines={2} style={{ color: c.fg, fontWeight: '600', flex: 1 }}>
          {playing.title}
        </Text>
        <CastButton />
        <IconButton icon="albums-outline" label="Picture in picture" onPress={() => player.current?.pip()} />
        <IconButton
          icon={app.watchLater.some((i) => i.id === savedVideo(channel, playing).id) ? 'bookmark' : 'bookmark-outline'}
          label="Watch Later"
          onPress={() => actions.saved.toggle(savedVideo(channel, playing))}
        />
        <IconButton
          icon={queuedIds.has(savedVideo(channel, playing).id) ? 'checkmark-circle' : 'add-circle-outline'}
          label={queuedIds.has(savedVideo(channel, playing).id) ? 'In the queue' : 'Add to queue'}
          onPress={() => {
            const item = savedVideo(channel, playing)
            if (queuedIds.has(item.id)) useQueue.getState().remove(item.id)
            else addToQueue(item)
          }}
        />
        <IconButton icon="close" label="Close player" onPress={() => setPlaying(null)} />
      </View>
    </View>
  ) : null

  const header = (
    <View>
      {playing ? null : (
        <View style={styles.banner}>
          {page?.bannerUrl ? (
            <Image source={page.bannerUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: PLATFORM_COLOR[channel.platform], opacity: 0.85 }]} />
          )}
          <View style={styles.avatar}>
            <Avatar channel={channel} size={72} />
          </View>
        </View>
      )}
      <View style={[{ paddingHorizontal: 16, paddingTop: playing ? 12 : 44, gap: 10 }, inPip && styles.hidden]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {playing ? <Avatar channel={channel} size={36} /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[{ color: c.fg, fontSize: 22, fontWeight: '800' }, displayFont(c)]}>
              {channel.displayName}
            </Text>
            <Text style={{ color: c.fg3 }}>{live ? `${PLATFORM_LABEL[channel.platform]} · Live now` : `${PLATFORM_LABEL[channel.platform]} · Offline`}</Text>
          </View>
          {live ? <Button title="Watch live" icon="radio" variant="accent" color="#eb0400" onPress={() => openChannel(channel.key)} /> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button title={`Open on ${PLATFORM_LABEL[channel.platform]}`} icon="open-outline" onPress={() => void WebBrowser.openBrowserAsync(channelPageUrl(channel))} />
          <Button
            title={group ? 'Combined' : 'Combine'}
            icon="people-outline"
            onPress={() => router.push({ pathname: '/combine', params: group ? { seed: channel.key, group: group.id } : { seed: channel.key } })}
          />
        </View>
        {members.length >= 2 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {members.map((m) => (
              <Chip
                key={m.key}
                label={m.displayName}
                active={m.key === channel.key}
                color={PLATFORM_COLOR[m.platform]}
                onPress={() => m.key !== channel.key && router.replace({ pathname: '/watch/[key]', params: { key: m.key, offline: '1' } })}
              />
            ))}
          </ScrollView>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {tabs.map((t) => (
            <Chip
              key={t.id}
              label={`${t.label}${page ? ` ${(t.id === 'clips' ? page.clips : page[t.id]).length}${page.cursors[t.id] ? '+' : ''}` : ''}`}
              active={tab === t.id}
              onPress={() => {
                pickedTab.current = true
                setTab(t.id)
              }}
            />
          ))}
        </ScrollView>
        {tab === 'clips' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            <Chip label={clipSort === 'newest' ? 'Newest first' : 'Oldest first'} active={false} onPress={() => setClipSort(clipSort === 'newest' ? 'oldest' : 'newest')} />
            {(['all', 'day', 'week', 'month'] as ClipWindow[]).map((w) => (
              <Chip key={w} label={CLIP_WINDOW_LABEL[w]} active={clipWindow === w} onPress={() => {
                  setClipNow(Date.now())
                  setClipWindow(w)
                }}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>
    </View>
  )

  const cols = portrait ? columns + 1 : columns
  return (
    <View style={{ flex: 1, backgroundColor: inPip ? '#000' : c.bg }}>
      {/* iPhone's swipe-back would leave the channel too; while a video plays, back closes it instead. */}
      <Stack.Screen options={{ gestureEnabled: !playing }} />
      {playerArea}
      <View style={[{ flex: 1 }, (inPip || fill) && styles.hidden]}>
        <FlashList
          ref={list}
          key={`${cols}${portrait}`}
          data={items}
          numColumns={cols}
          keyExtractor={(m) => `${m.kind}:${m.id}`}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => <MediaCard item={item} platform={channel.platform} portrait={portrait} onPlay={play} onMenu={videoMenu} />}
          // Next batch is asked for well before the end, so it's usually there when you arrive.
          onEndReachedThreshold={1.5}
          onEndReached={() => void loadMore()}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} color={c.fg3} /> : null}
          ListEmptyComponent={
            !page && !error ? (
              <ActivityIndicator style={{ margin: 32 }} color={c.fg3} />
            ) : error && !page ? (
              <EmptyState icon="cloud-offline-outline" title="Couldn’t load this channel" text={error} />
            ) : (
              <Text style={{ color: c.fg3, textAlign: 'center', margin: 32 }}>
                {tab === 'clips' && clipWindow !== 'all' && page?.clips.length
                  ? `No ${clipsLabel?.toLowerCase()} from the ${CLIP_WINDOW_LABEL[clipWindow].toLowerCase()}.`
                  : `No ${tab === 'streams' ? 'past streams' : tab === 'videos' ? 'videos' : (clipsLabel?.toLowerCase() ?? 'clips')} found for this channel.`}
              </Text>
            )
          }
        />
      </View>
      {/* Back and home stay in the corner however far the list scrolls (the dock is hidden here). */}
      <View style={[styles.cornerBar, { top: insets.top + 6 }, inPip && styles.hidden]} pointerEvents="box-none">
        <FloatingButton icon="chevron-back" label="Back" onPress={back} />
        <HomeButton />
        <View style={{ flex: 1 }} pointerEvents="none" />
        {playing ? null : <FloatingButton icon="ellipsis-horizontal" label="Channel menu" onPress={() => openChannelMenu(channel)} />}
      </View>
    </View>
  )
}

const MediaCard = memo(function MediaCard({
  item,
  platform,
  portrait,
  onPlay,
  onMenu
}: {
  item: MediaItem
  platform: Platform
  portrait: boolean
  onPlay(m: MediaItem): void
  onMenu(m: MediaItem): void
}): React.JSX.Element {
  const c = useColors()
  const fraction = useVodProgress((s) => progressFraction(s.entries, progressKey(platform, item.id)))
  return (
    <Pressable onPress={() => onPlay(item)} onLongPress={() => onMenu(item)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} accessibilityRole="button">
      <Thumbnail uri={item.thumbnail} style={portrait ? { aspectRatio: 9 / 16 } : undefined}>
        {item.durationText ? (
          <View style={styles.duration}>
            <Text style={styles.durationText}>{item.durationText}</Text>
          </View>
        ) : null}
        {fraction !== null ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progress, { width: `${fraction * 100}%` }]} />
          </View>
        ) : null}
      </Thumbnail>
      <Text numberOfLines={2} style={{ color: c.fg, fontSize: 13, fontWeight: '600', marginTop: 6 }}>
        {item.title}
      </Text>
      <Text numberOfLines={1} style={{ color: c.fg3, fontSize: 12 }}>
        {[item.viewCountText, item.publishedText].filter(Boolean).join(' · ')}
      </Text>
    </Pressable>
  )
})

/** On refresh, keep pages already loaded via "Load more" (new items first, then what was loaded). */
function mergeLoaded(prev: ChannelPageData, next: ChannelPageData): Partial<ChannelPageData> {
  const merge = (a: MediaItem[], b: MediaItem[]): MediaItem[] => {
    const ids = new Set(b.map((m) => m.id))
    return [...b, ...a.filter((m) => !ids.has(m.id))]
  }
  const grew = (cat: MediaCategory): boolean => prev[cat].length > next[cat].length
  return {
    streams: merge(prev.streams, next.streams),
    videos: merge(prev.videos, next.videos),
    clips: merge(prev.clips, next.clips),
    cursors: {
      streams: grew('streams') ? prev.cursors.streams : next.cursors.streams,
      videos: grew('videos') ? prev.cursors.videos : next.cursors.videos,
      clips: grew('clips') ? prev.cursors.clips : next.cursors.clips
    }
  }
}

const styles = StyleSheet.create({
  banner: { height: 170, justifyContent: 'flex-end' },
  cornerBar: { position: 'absolute', left: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: { paddingHorizontal: 6, marginHorizontal: 4, marginBottom: 16 },
  cardPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  avatar: { position: 'absolute', left: 16, bottom: -36, borderRadius: 999, padding: 3, backgroundColor: '#0000' },
  playingBar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 16, paddingRight: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  duration: { position: 'absolute', right: 6, bottom: 6, backgroundColor: '#000b', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  durationText: { color: '#fff', fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: '#fff4' },
  progress: { height: 3, backgroundColor: '#eb0400' },
  hidden: { display: 'none' }
})
