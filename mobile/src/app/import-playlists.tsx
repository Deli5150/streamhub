import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { Icon } from '../ui/Icon'
import type { YouTubePlaylistSummary } from '@shared/types'
import { actions, useApp } from '../lib/hub'
import { Button, Thumbnail } from '../ui/components'
import { errorMessage, useColors } from '../ui/theme'

/** Pick YouTube playlists to import (the desktop's ImportPlaylistsDialog), then confirm. */
export default function ImportPlaylistsScreen(): React.JSX.Element {
  const c = useColors()
  const imported = useApp((s) => s.app?.ytPlaylists ?? [])
  const [list, setList] = useState<YouTubePlaylistSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    actions.playlists.list().then(setList, (e) => setError(errorMessage(e)))
  }, [])

  const isImported = (id: string): boolean => imported.some((p) => p.id === id)
  const choosable = (list ?? []).filter((p) => !isImported(p.id))
  const allPicked = choosable.length > 0 && choosable.every((p) => picked.includes(p.id))
  const toggle = (id: string): void => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const confirm = (): void => {
    setImporting(true)
    actions.playlists
      .import(picked)
      .then(() => router.back())
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setImporting(false))
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { borderBottomColor: c.separator }]}>
        <Button title="Cancel" variant="plain" disabled={importing} onPress={() => router.back()} />
        <Text style={{ color: c.fg, fontWeight: '700', fontSize: 17, flex: 1, textAlign: 'center' }}>YouTube playlists</Text>
        <Button
          title={importing ? 'Importing…' : picked.length ? `Import ${picked.length}` : 'Import'}
          variant="plain"
          disabled={!picked.length || importing}
          onPress={confirm}
        />
      </View>
      <Text style={[styles.help, { color: c.fg3 }]}>
        Pick the playlists to bring into StreamHub. They show on Live and stay up to date with YouTube. YouTube doesn’t share your Watch Later list with apps.
      </Text>
      {error ? (
        <Text style={[styles.help, { color: c.danger }]}>{error}</Text>
      ) : !list ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={c.fg3} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={
            choosable.length ? (
              <View style={styles.selectAll}>
                <Text style={{ color: c.fg3, fontSize: 13 }}>
                  {picked.length} of {choosable.length} selected
                </Text>
                <Button
                  title={allPicked ? 'Select none' : 'Select all'}
                  variant="plain"
                  onPress={() => setPicked(allPicked ? [] : choosable.map((p) => p.id))}
                />
              </View>
            ) : undefined
          }
          ListEmptyComponent={<Text style={[styles.help, { color: c.fg3 }]}>This YouTube account has no playlists yet.</Text>}
          renderItem={({ item }) => {
            const done = isImported(item.id)
            const on = done || picked.includes(item.id)
            return (
              <Pressable
                disabled={done || importing}
                onPress={() => toggle(item.id)}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.card : 'transparent', opacity: done ? 0.55 : 1 }]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: done }}
              >
                <Thumbnail uri={item.thumbnail} style={{ width: 112, borderRadius: 6 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={2} style={{ color: c.fg, fontWeight: '600', fontSize: 14 }}>
                    {item.title}
                  </Text>
                  <Text style={{ color: c.fg3, fontSize: 12 }}>{done ? 'Imported' : item.count !== undefined ? `${item.count} videos` : ''}</Text>
                </View>
                <Icon name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? c.accent : c.fg3} />
              </Pressable>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  help: { fontSize: 13, lineHeight: 18, paddingHorizontal: 16, paddingVertical: 12 },
  selectAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }
})
