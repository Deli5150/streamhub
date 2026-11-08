import { useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { PLATFORM_LABEL, type Channel, type LiveInfo } from '@shared/types'
import { embedUrl } from '@shared/urls'
import { groupOf } from '../../../../src/renderer/src/lib/combined'
import { actions, useApp } from '../../lib/hub'
import { savedChannelId, savedLive, useChannel } from '../../lib/ui'
import { AboutView, TogetherRow, useTogether } from '../../ui/About'
import { ChannelPage } from '../../ui/ChannelPage'
import { Chat } from '../../ui/Chat'
import { useKeyboardCover } from '../../ui/keyboard'
import { openChannelMenu } from '../../ui/channelMenu'
import { Avatar, EmptyState, IconButton } from '../../ui/components'
import { FloatingButton, HomeButton } from '../../ui/HomeButton'
import { CastButton } from '../../ui/CastButton'
import { useAutoPip, useLayoutWindow, usePipActive } from '../../ui/pip'
import { Player, type PlayerHandle } from '../../ui/Player'
import { PLATFORM_COLOR, formatViewers, uptime, useColors } from '../../ui/theme'

/** A live stream with chat, or the channel's page when it's offline (or `offline` is set). */
export default function WatchScreen(): React.JSX.Element {
  const { key, offline } = useLocalSearchParams<{ key: string; offline?: string }>()
  const { channel, live } = useChannel(key)
  if (!channel) return <EmptyState icon="radio-outline" title="Channel not found" />
  if (!live || offline) return <ChannelPage key={channel.key} channel={channel} live={live} />
  return <LivePlayer key={channel.key} channel={channel} live={live} />
}

/** Live members of the channel's combined group (this channel first), else just it. */
function useLiveMembers(channel: Channel): Channel[] {
  const app = useApp((s) => s.app)
  const group = app ? groupOf(app.settings.combined, channel.key) : undefined
  if (!app || !group) return [channel]
  const byKey = new Map(app.channels.map((ch) => [ch.key, ch]))
  const members = group.memberKeys.map((k) => byKey.get(k)).filter((ch): ch is Channel => Boolean(ch && app.live[ch.key]))
  return [channel, ...members.filter((ch) => ch.key !== channel.key)]
}

type Panel = 'chat' | 'about'

function LivePlayer({ channel, live }: { channel: Channel; live: LiveInfo }): React.JSX.Element {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const { width, height } = useLayoutWindow()
  const landscape = width > height
  // Android picture-in-picture: only the player shows, in the same place so the stream keeps playing.
  const inPip = usePipActive()
  const pipHidden = inPip ? styles.hidden : null
  const app = useApp((s) => s.app)!
  const members = useLiveMembers(channel)
  // Combined channels: which member's stream plays and whose chat shows, picked separately.
  const [videoKey, setVideoKey] = useState(channel.key)
  const [chatKey, setChatKey] = useState(channel.key)
  const [panel, setPanel] = useState<Panel>('chat')
  const [chatHidden, setChatHidden] = useState(false)
  const player = useRef<PlayerHandle>(null)
  const videoChannel = members.find((m) => m.key === videoKey) ?? channel
  const chatChannel = members.find((m) => m.key === chatKey) ?? channel
  const videoLive = app.live[videoChannel.key] ?? live
  const url = embedUrl(videoChannel, videoLive)
  const together = useTogether(videoChannel, videoLive.title)
  const saved = app.watchLater.some((i) => i.id === savedChannelId(videoChannel.key))
  useAutoPip(Boolean(url))
  // Typing in chat: the chat moves up above the keyboard, and in portrait the player shrinks and the
  // rows between it and chat fold away, so there's room to see the messages and what you're typing.
  const keyboard = useKeyboardCover()
  const typing = keyboard > 0 && panel === 'chat'

  const playerView = url ? (
    <Player ref={player} key={url} platform={videoChannel.platform} url={url} style={landscape && !inPip ? { flex: 1 } : typing && !landscape ? styles.typingPlayer : styles.pipSafe} />
  ) : (
    <View style={[styles.unavailable, landscape ? { flex: 1 } : { aspectRatio: 16 / 9 }]}>
      <Text style={{ color: '#aaa' }}>Stream player unavailable</Text>
    </View>
  )

  const info = (
    <View style={[styles.info, { borderBottomColor: c.separator }]}>
      <Pressable onPress={() => router.push({ pathname: '/watch/[key]', params: { key: videoChannel.key, offline: '1' } })} accessibilityLabel="Channel page">
        <Avatar channel={videoChannel} size={32} live />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: c.fg, fontWeight: '700', fontSize: 15 }}>
          {videoChannel.displayName}
        </Text>
        <Text numberOfLines={1} style={{ color: c.fg2, fontSize: 13 }}>
          {videoLive.title}
        </Text>
        <Text numberOfLines={1} style={{ color: c.fg3, fontSize: 12 }}>
          {[videoLive.category, videoLive.viewers !== undefined ? `${formatViewers(videoLive.viewers)} watching` : '', uptime(videoLive.startedAt)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <CastButton />
      <IconButton icon="albums-outline" label="Picture in picture" size={20} onPress={() => player.current?.pip()} />
      <IconButton icon={saved ? 'bookmark' : 'bookmark-outline'} label="Watch Later" size={20} onPress={() => actions.saved.toggle(savedLive(videoChannel, videoLive))} />
      <IconButton icon="ellipsis-horizontal" label="More" size={20} onPress={() => openChannelMenu(videoChannel)} />
    </View>
  )

  const switcher = (label: string, activeKey: string, pick: (k: string) => void): React.JSX.Element | null =>
    members.length >= 2 ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.noGrow} contentContainerStyle={styles.switcher}>
        <Text style={{ color: c.fg3, fontSize: 12, alignSelf: 'center' }}>{label}</Text>
        {members.map((m) => {
          const active = m.key === activeKey
          return (
            <Pressable key={m.key} onPress={() => pick(m.key)} style={[styles.pill, { backgroundColor: active ? PLATFORM_COLOR[m.platform] : c.bg2 }]}>
              <Text style={{ color: active ? (m.platform === 'kick' ? '#000' : '#fff') : c.fg2, fontWeight: '600', fontSize: 12 }}>{PLATFORM_LABEL[m.platform]}</Text>
            </Pressable>
          )
        })}
      </ScrollView>
    ) : null

  const tabs = (
    <View style={[styles.tabs, { borderBottomColor: c.separator }, typing && !landscape && styles.hidden]}>
      {(['chat', 'about'] as Panel[]).map((p) => (
        <Pressable key={p} onPress={() => setPanel(p)} style={[styles.tab, panel === p && { borderBottomColor: c.accent }]} accessibilityRole="tab" accessibilityState={{ selected: panel === p }}>
          <Text style={{ color: panel === p ? c.fg : c.fg3, fontWeight: '600' }}>
            {p === 'chat' ? 'Chat' : videoChannel.platform === 'youtube' || videoChannel.platform === 'rumble' ? 'Description' : 'About'}
          </Text>
        </Pressable>
      ))}
      {landscape ? <IconButton icon="chevron-forward" label="Hide chat" size={18} onPress={() => setChatHidden(true)} /> : null}
    </View>
  )

  const side = (
    <View style={{ flex: 1 }}>
      {tabs}
      {panel === 'chat' ? (
        <>
          {switcher('Chat', chatChannel.key, setChatKey)}
          <Chat channel={chatChannel} live={app.live[chatChannel.key]} />
        </>
      ) : (
        <AboutView channel={videoChannel} streamId={videoLive.streamId} />
      )}
    </View>
  )

  if (landscape) {
    return (
      <View style={[styles.row, { backgroundColor: '#000' }, !inPip && { paddingLeft: insets.left, paddingRight: insets.right }]}>
        <View style={{ flex: 1 }}>
          {playerView}
          <View style={[styles.floatingBack, { top: insets.top + 4 }, pipHidden]}>
            <FloatingButton icon="chevron-back" label="Back" onPress={() => router.back()} />
            <HomeButton />
            {chatHidden ? <FloatingButton icon="chatbubble-outline" label="Show chat" onPress={() => setChatHidden(false)} /> : null}
          </View>
        </View>
        {!chatHidden ? (
          <View style={[{ width: Math.min(360, width * 0.36), backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: typing ? keyboard : 0 }, pipHidden]}>
            {side}
          </View>
        ) : null}
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: inPip ? '#000' : c.bg }}>
      <View style={[{ paddingTop: inPip ? 0 : insets.top, backgroundColor: '#000' }, inPip && { flex: 1 }]}>
        {playerView}
        <View style={[styles.floatingBack, { top: insets.top + 4 }, pipHidden]}>
          <FloatingButton icon="chevron-down" label="Back" onPress={() => router.back()} />
          <HomeButton />
        </View>
      </View>
      <View style={[{ flex: 1 }, pipHidden]}>
        <View style={typing ? styles.hidden : null}>
          {info}
          {switcher('Stream', videoChannel.key, setVideoKey)}
          <TogetherRow list={together} />
        </View>
        <View style={{ flex: 1, paddingBottom: typing ? keyboard : insets.bottom }}>{side}</View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  unavailable: { width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  info: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 2, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  switcher: { gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  pill: { paddingHorizontal: 12, height: 28, borderRadius: 14, justifyContent: 'center' },
  tabs: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  row: { flex: 1, flexDirection: 'row' },
  floatingBack: { position: 'absolute', left: 10, flexDirection: 'row', gap: 8 },
  hidden: { display: 'none' },
  /**
   * 16:9 by width. Also the shape of Android's picture-in-picture window, whose height the app can't
   * read reliably there (the screen keeps its old height; the reported window height is the whole
   * screen's), so filling either would push the video out of view.
   */
  pipSafe: { width: '100%', aspectRatio: 16 / 9 },
  typingPlayer: { width: '55%', aspectRatio: 16 / 9, alignSelf: 'center' },
  // A ScrollView otherwise takes a share of the screen's free space, squeezing the chat.
  noGrow: { flexGrow: 0 }
})
