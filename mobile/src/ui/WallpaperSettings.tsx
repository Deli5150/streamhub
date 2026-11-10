import { useState } from 'react'
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import Slider from '@react-native-community/slider'
import { Image } from 'expo-image'
import { Icon } from './Icon'
import { MAX_WALLPAPERS, useWallpapers, wallpaperUri, type WallpaperFit } from '../lib/wallpapers'
import { Button, Chip, Group, GroupRow } from './components'
import { errorMessage, useColors } from './theme'

const FITS: { value: WallpaperFit; label: string }[] = [
  { value: 'cover', label: 'Cover' },
  { value: 'contain', label: 'Fit' },
  { value: 'fill', label: 'Stretch' }
]

/** Settings → Wallpaper (the desktop's Wallpapers section): your own photos behind the Live tab. */
export function WallpaperSettings(): React.JSX.Element {
  const c = useColors()
  const bg = useWallpapers()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const hasImage = bg.images.length > 0

  const pick = async (): Promise<void> => {
    setNote(null)
    setBusy(true)
    try {
      const { skipped } = await bg.pick()
      if (skipped) setNote(`${skipped} photo${skipped === 1 ? '' : 's'} couldn’t be added.`)
    } catch (e) {
      setNote(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const preview = { transform: [{ rotate: `${bg.rotation}deg` }, { scale: bg.zoom }] }

  return (
    <View>
      <Group>
        <GroupRow first label="Multiple wallpapers" detail="Add several and the Live tab fades between them.">
          <Switch value={bg.multiEnabled} onValueChange={(v) => bg.update({ multiEnabled: v })} />
        </GroupRow>
      </Group>

      {bg.multiEnabled ? (
        <View style={{ marginBottom: 16 }}>
          <View style={styles.grid}>
            {bg.images.map((w, i) => (
              <View key={w.file} style={[styles.thumb, { backgroundColor: c.bg2 }]}>
                <Image source={wallpaperUri(w)} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={`Wallpaper ${i + 1}`} />
                <Pressable onPress={() => bg.remove(i)} style={styles.remove} hitSlop={6} accessibilityLabel={`Remove wallpaper ${i + 1}`}>
                  <Icon name="trash" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            {bg.images.length < MAX_WALLPAPERS ? (
              <Pressable onPress={pick} disabled={busy} style={[styles.thumb, styles.add, { borderColor: c.separator }]} accessibilityRole="button">
                <Icon name="add" size={22} color={c.fg3} />
                <Text style={{ color: c.fg3, fontSize: 12 }}>{busy ? 'Adding…' : 'Add photos'}</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={[styles.hint, { color: c.fg3 }]}>
            {bg.images.length < 2 ? 'Add at least 2 wallpapers to fade between them.' : `${bg.images.length} wallpapers — fading every few seconds.`}
          </Text>
        </View>
      ) : (
        <View style={{ marginBottom: 16, gap: 10 }}>
          <View style={[styles.preview, { backgroundColor: c.bg2, borderColor: c.separator }]}>
            {hasImage ? (
              <Image source={wallpaperUri(bg.images[0])} style={[StyleSheet.absoluteFill, preview]} contentFit={bg.fit} accessibilityLabel="Wallpaper preview" />
            ) : (
              <View style={styles.empty}>
                <Icon name="image-outline" size={30} color={c.fg3} />
                <Text style={{ color: c.fg3, fontSize: 13 }}>No wallpaper</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={hasImage ? 'Replace photo' : 'Choose photo'} icon="image-outline" busy={busy} onPress={pick} />
            {hasImage ? <Button title="Remove" variant="danger" onPress={() => bg.clear()} /> : null}
          </View>
        </View>
      )}
      {note ? <Text style={[styles.hint, { color: c.danger, marginTop: -8, marginBottom: 12 }]}>{note}</Text> : null}

      <View style={hasImage ? null : styles.disabled} pointerEvents={hasImage ? 'auto' : 'none'}>
        <Group>
          <GroupRow first label="Size" detail="How the photo fills the screen.">
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {FITS.map((f) => (
                <Chip key={f.value} label={f.label} active={bg.fit === f.value} onPress={() => bg.update({ fit: f.value })} />
              ))}
            </View>
          </GroupRow>
          <SliderRow label="Zoom" value={Math.round(bg.zoom * 100)} unit="%" min={50} max={300} onChange={(v) => bg.update({ zoom: v / 100 })} />
          <SliderRow label="Rotation" value={bg.rotation} unit="°" min={-180} max={180} onChange={(v) => bg.update({ rotation: v })} />
        </Group>
      </View>
    </View>
  )
}

function SliderRow({ label, value, unit, min, max, onChange }: { label: string; value: number; unit: string; min: number; max: number; onChange(v: number): void }): React.JSX.Element {
  const c = useColors()
  return (
    <View style={[styles.sliderRow, { borderTopColor: c.separator }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: c.fg, fontSize: 16 }}>{label}</Text>
        <Text style={{ color: c.fg3, fontVariant: ['tabular-nums'] }}>
          {value}
          {unit}
        </Text>
      </View>
      <Slider
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={1}
        onValueChange={onChange}
        minimumTrackTintColor={c.accent}
        maximumTrackTintColor={c.separator}
        accessibilityLabel={label}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: '31.5%', aspectRatio: 9 / 16, borderRadius: 10, overflow: 'hidden' },
  add: { borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  remove: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center' },
  preview: { width: '45%', aspectRatio: 9 / 16, borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, alignSelf: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  hint: { fontSize: 13, marginTop: 8, marginHorizontal: 4 },
  disabled: { opacity: 0.45 },
  sliderRow: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 4 }
})
