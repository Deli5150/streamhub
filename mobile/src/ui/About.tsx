import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import * as WebBrowser from 'expo-web-browser'
import type { Channel, ChannelAbout, TogetherChannel } from '@shared/types'
import { actions, useApp } from '../lib/hub'
import { openChannel } from './channelMenu'
import { Avatar } from './components'
import { errorMessage, useColors } from './theme'

// Under a live stream: the channel's About section (Twitch, Kick) or the stream's description
// (YouTube, Rumble), and the channels it's streaming with (the desktop's AboutSection and
// StreamTogether).

const open = (url: string): void => void WebBrowser.openBrowserAsync(url)

/** Markdown-style [text](https://…) links or bare https:// addresses. */
const LINK = /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)|(https:\/\/[^\s<>()]+[^\s<>().,!?;:'"])/g

/** Text with its links made tappable. */
export function LinkedText({ text, style }: { text: string; style?: object }): React.JSX.Element {
  const c = useColors()
  const parts: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(LINK)) {
    if (m.index! > last) parts.push(text.slice(last, m.index))
    const url = m[2] ?? m[3]
    parts.push(
      <Text key={m.index} style={{ color: c.accent }} onPress={() => open(url)} suppressHighlighting={false}>
        {m[1] ?? m[3]}
      </Text>
    )
    last = m.index! + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <Text style={[{ color: c.fg2, fontSize: 14, lineHeight: 20 }, style]}>{parts}</Text>
}

export function AboutView({ channel, streamId }: { channel: Channel; streamId?: string }): React.JSX.Element {
  const c = useColors()
  // Results are kept with the stream they're for, so switching streams never shows the old one.
  const wanted = `${channel.key}|${streamId ?? ''}`
  const [result, setResult] = useState<{ for: string; about?: ChannelAbout; error?: string } | null>(null)
  useEffect(() => {
    let cancelled = false
    actions.getAbout(channel.key).then(
      (about) => !cancelled && setResult({ for: wanted, about }),
      (e) => !cancelled && setResult({ for: wanted, error: errorMessage(e) })
    )
    return () => {
      cancelled = true
    }
  }, [channel.key, wanted])
  const current = result?.for === wanted ? result : null
  const about = current?.about ?? null
  const error = current?.error ?? null

  if (error) return <Text style={[styles.pad, { color: c.fg3 }]}>Couldn’t load {channel.platform === 'youtube' || channel.platform === 'rumble' ? 'the description' : 'the About section'}: {error}</Text>
  if (!about) return <ActivityIndicator style={styles.pad} color={c.fg3} />
  const empty = !about.text && !about.links.length && !about.panels.length
  return (
    <ScrollView contentContainerStyle={[styles.pad, { gap: 16 }]}>
      {empty ? <Text style={{ color: c.fg3 }}>{about.kind === 'description' ? 'No description.' : 'This channel has no About section.'}</Text> : null}
      {about.text ? <LinkedText text={about.text} /> : null}
      {about.links.length ? (
        <View style={styles.links}>
          {about.links.map((l) => (
            <Pressable key={l.url} onPress={() => open(l.url)} style={[styles.link, { backgroundColor: c.bg2 }]}>
              <Text style={{ color: c.fg, fontWeight: '600' }}>{l.title}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {about.panels.map((p, i) => (
        <View key={i} style={{ gap: 6 }}>
          {p.imageUrl ? (
            <Pressable disabled={!p.linkUrl} onPress={() => p.linkUrl && open(p.linkUrl)}>
              <Image source={p.imageUrl} style={styles.panelImage} contentFit="contain" />
            </Pressable>
          ) : null}
          {p.title ? <Text style={{ color: c.fg, fontWeight: '700', fontSize: 15 }}>{p.title}</Text> : null}
          {p.text ? <LinkedText text={p.text} /> : null}
        </View>
      ))}
    </ScrollView>
  )
}

const NONE: TogetherChannel[] = []

/** Channels the stream is with (Twitch shared chat / Stream Together) or @mentions in its title. */
export function useTogether(channel: Channel, title: string): TogetherChannel[] {
  const wanted = `${channel.key}|${title}`
  const [result, setResult] = useState<{ for: string; list: TogetherChannel[] } | null>(null)
  useEffect(() => {
    let cancelled = false
    if (channel.platform !== 'twitch') return
    actions.getTogether(channel.key).then(
      (list) => !cancelled && setResult({ for: wanted, list }),
      () => undefined
    )
    return () => {
      cancelled = true
    }
  }, [channel.key, channel.platform, wanted])
  return result?.for === wanted ? result.list : NONE
}

export function TogetherRow({ list }: { list: TogetherChannel[] }): React.JSX.Element | null {
  const c = useColors()
  const followed = useApp((s) => s.app?.channels)
  if (!list.length) return null
  return (
    // flexGrow 0: a ScrollView otherwise takes a share of the screen's free space (away from chat).
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingBottom: 6 }}>
      {list.map((t) => {
        const known = followed?.find((ch) => ch.platform === t.platform && ch.id === t.login)
        const ch: Channel = known ?? { key: `${t.platform}:${t.login}`, platform: t.platform, id: t.login, displayName: t.displayName, avatarUrl: t.avatarUrl }
        return (
          <Pressable
            key={t.login}
            onPress={() => (known ? openChannel(known.key) : open(`https://www.twitch.tv/${t.login}`))}
            style={[styles.together, { backgroundColor: c.bg2 }]}
            accessibilityRole="button"
          >
            <Avatar channel={ch} size={22} live={t.live} />
            <Text style={{ color: c.fg, fontWeight: '600', fontSize: 13 }}>{t.displayName}</Text>
            <Text style={{ color: c.fg3, fontSize: 12 }}>{t.reason === 'together' ? 'with' : 'mentioned'}</Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  pad: { padding: 16 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  link: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  panelImage: { width: '100%', aspectRatio: 2.5, borderRadius: 8 },
  together: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 10, height: 34, borderRadius: 17 }
})
