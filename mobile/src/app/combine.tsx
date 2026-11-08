import { useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { combinedEdits, nameMatches } from '../../../src/renderer/src/lib/combined'
import { actions, useApp } from '../lib/hub'
import { Button, ChannelRow } from '../ui/components'
import { useColors } from '../ui/theme'

/**
 * Merge one streamer's channels on different platforms into one profile (the desktop's
 * CombineDialog): ★ picks whose name and avatar show, ▶ picks which stream plays.
 */
export default function CombineScreen(): React.JSX.Element {
  const { seed, group: groupId } = useLocalSearchParams<{ seed: string; group?: string }>()
  const c = useColors()
  const app = useApp((s) => s.app)!
  const group = app.settings.combined.find((g) => g.id === groupId) ?? null
  // A new combine starts with the channel's name, so the streamer's other channels are listed.
  const [search, setSearch] = useState(() => (group ? '' : (app.channels.find((ch) => ch.key === seed)?.displayName ?? '')))
  const [selected, setSelected] = useState<string[]>(group ? [...group.memberKeys] : [seed])
  const [mainKey, setMainKey] = useState(group?.mainKey ?? seed)
  const [defaultKey, setDefaultKey] = useState(group?.defaultKey ?? seed)

  const rows = useMemo(() => {
    return app.channels
      .filter((ch) => selected.includes(ch.key) || nameMatches(search, ch))
      .sort((a, b) => Number(selected.includes(b.key)) - Number(selected.includes(a.key)) || a.displayName.localeCompare(b.displayName))
  }, [app, search, selected])

  const toggle = (key: string): void => {
    setSelected((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((k) => k !== key)
        if (key === mainKey) setMainKey(next[0] ?? '')
        if (key === defaultKey) setDefaultKey(next[0] ?? '')
        return next
      }
      if (prev.length === 0) {
        setMainKey(key)
        setDefaultKey(key)
      }
      return [...prev, key]
    })
  }

  const confirm = (): void => {
    if (selected.length < 2) return
    const main = selected.includes(mainKey) ? mainKey : selected[0]
    const def = selected.includes(defaultKey) ? defaultKey : main
    const groups = app.settings.combined
    actions.updateSettings({
      combined: group ? combinedEdits.update(groups, group.id, selected, main, def) : combinedEdits.create(groups, selected, main, def)
    })
    router.back()
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { borderBottomColor: c.separator }]}>
        <Button title="Cancel" variant="plain" onPress={() => router.back()} />
        <Text style={{ color: c.fg, fontWeight: '700', fontSize: 17, flex: 1, textAlign: 'center' }}>{group ? 'Edit combined' : 'Combine channels'}</Text>
        <Button title={group ? 'Save' : 'Combine'} variant="plain" disabled={selected.length < 2} onPress={confirm} />
      </View>
      <Text style={[styles.help, { color: c.fg3 }]}>Pick the same streamer’s channels on other platforms. ★ shows their name and picture; ▶ is the stream that plays first.</Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search channels"
        placeholderTextColor={c.fg3}
        clearButtonMode="always"
        selectTextOnFocus
        style={[styles.search, { backgroundColor: c.bg2, color: c.fg }]}
      />
      <FlatList
        data={rows}
        keyExtractor={(ch) => ch.key}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const on = selected.includes(item.key)
          return (
            <ChannelRow
              channel={item}
              live={app.live[item.key]}
              onPress={() => toggle(item.key)}
              right={
                <View style={styles.right}>
                  {on ? (
                    <>
                      <Pressable onPress={() => setMainKey(item.key)} hitSlop={6} accessibilityLabel="Show this channel's name and picture">
                        <Ionicons name={mainKey === item.key ? 'star' : 'star-outline'} size={20} color={mainKey === item.key ? '#ffcc00' : c.fg3} />
                      </Pressable>
                      <Pressable onPress={() => setDefaultKey(item.key)} hitSlop={6} accessibilityLabel="Play this channel's stream first">
                        <Ionicons name={defaultKey === item.key ? 'play-circle' : 'play-circle-outline'} size={22} color={defaultKey === item.key ? c.accent : c.fg3} />
                      </Pressable>
                    </>
                  ) : null}
                  <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? c.accent : c.fg3} />
                </View>
              }
            />
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, height: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  help: { fontSize: 13, lineHeight: 18, paddingHorizontal: 16, paddingTop: 12 },
  search: { margin: 16, marginBottom: 8, height: 38, borderRadius: 10, paddingHorizontal: 12, fontSize: 16 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 14 }
})
