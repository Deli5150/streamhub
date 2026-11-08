import AsyncStorage from '@react-native-async-storage/async-storage'
import { Directory, File, Paths } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { randomUUID } from 'expo-crypto'
import { create } from 'zustand'
import { pngLuminance } from './pngLuminance'

// Home-screen wallpapers (the desktop's renderer/lib/background.ts): your own photos behind the Live
// tab, one or several that crossfade, with size, zoom and rotation. Photos are copied into the app's
// documents (picker files are temporary) and kept by file name, since the app's folder path can
// change between installs. Each photo's brightness is measured once, when it's added (pngLuminance.ts),
// so text over it can be dark or light.

export const MAX_WALLPAPERS = 10
/** Photos are scaled down to this on their longest side; a phone screen needs no more. */
const MAX_SIDE = 2048
const KEY = 'streamhub:home-bg'

export type WallpaperFit = 'cover' | 'contain' | 'fill'

export interface Wallpaper {
  /** File name in the wallpapers folder. */
  file: string
  /** Average perceived brightness 0–1, or null if it couldn't be measured. */
  luminance: number | null
}

interface Saved {
  images: Wallpaper[]
  fit: WallpaperFit
  zoom: number
  rotation: number
  /** Several wallpapers that crossfade. */
  multiEnabled: boolean
}

const DEFAULTS: Saved = { images: [], fit: 'cover', zoom: 1, rotation: 0, multiEnabled: false }

const folder = (): Directory => new Directory(Paths.document, 'wallpapers')
export const wallpaperUri = (w: Wallpaper): string => new File(folder(), w.file).uri

interface WallpaperState extends Saved {
  update(patch: Partial<Omit<Saved, 'images'>>): void
  /** Opens the photo library and adds (or, with one wallpaper, replaces) what's picked. */
  pick(): Promise<{ added: number; skipped: number }>
  remove(index: number): void
  clear(): void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

/** Saves shortly after the last change (the zoom and rotation sliders change continuously). */
function persist(s: Saved): void {
  const { images, fit, zoom, rotation, multiEnabled } = s
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    AsyncStorage.setItem(KEY, JSON.stringify({ images, fit, zoom, rotation, multiEnabled })).catch(() => undefined)
  }, 300)
}

function deleteFiles(images: Wallpaper[]): void {
  for (const w of images) {
    try {
      new File(folder(), w.file).delete()
    } catch {
      // already gone
    }
  }
}

export const useWallpapers = create<WallpaperState>((set, get) => {
  const commit = (patch: Partial<Saved>): void => {
    set(patch)
    persist(get())
  }
  return {
    ...DEFAULTS,
    update: (patch) => commit(patch),
    async pick() {
      const { multiEnabled, images } = get()
      const room = multiEnabled ? MAX_WALLPAPERS - images.length : 1
      if (room <= 0) return { added: 0, skipped: 0 }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: multiEnabled,
        selectionLimit: room,
        orderedSelection: true,
        // Hand over the photo as stored (often HEIC) instead of converting full-size originals to
        // JPEG first, which is slow and can fail; the copy made below is scaled down anyway.
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current
      })
      if (result.canceled) return { added: 0, skipped: 0 }
      const picked = result.assets.slice(0, room)
      // One at a time, so several full-size photos are never decoded at once.
      const added: Wallpaper[] = []
      for (const a of picked) {
        const w = await importPhoto(a.uri, a.width, a.height).catch(() => null)
        if (w) added.push(w)
      }
      if (multiEnabled) commit({ images: [...get().images, ...added] })
      else if (added.length) {
        deleteFiles(get().images)
        commit({ images: added.slice(0, 1) })
      }
      return { added: added.length, skipped: result.assets.length - added.length }
    },
    remove(index) {
      const images = get().images
      deleteFiles(images.slice(index, index + 1))
      commit({ images: images.filter((_, i) => i !== index) })
    },
    clear() {
      deleteFiles(get().images)
      commit({ images: [] })
    }
  }
})

export async function loadWallpapers(): Promise<void> {
  const raw = await AsyncStorage.getItem(KEY).catch(() => null)
  if (!raw) return
  const saved = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Saved>) }
  // Drop entries whose file is gone (e.g. the app's data was partly restored).
  saved.images = saved.images.filter((w) => new File(folder(), w.file).exists)
  useWallpapers.setState(saved)
}

/** Scales a picked photo down, saves it as the app's own copy and measures its brightness. */
async function importPhoto(uri: string, width: number, height: number): Promise<Wallpaper> {
  const context = ImageManipulator.manipulate(uri)
  if (Math.max(width, height) > MAX_SIDE) context.resize(width >= height ? { width: MAX_SIDE, height: null } : { width: null, height: MAX_SIDE })
  const saved = await (await context.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.88 })
  const dir = folder()
  dir.create({ intermediates: true, idempotent: true })
  const file = `${randomUUID()}.jpg`
  new File(saved.uri).copy(new File(dir, file))
  return { file, luminance: await luminance(saved.uri).catch(() => null) }
}

/** Average perceived brightness (0–1) from a 32×32 copy (the desktop's method, see pngLuminance.ts). */
async function luminance(uri: string): Promise<number | null> {
  const small = await (await ImageManipulator.manipulate(uri).resize({ width: 32, height: 32 }).renderAsync()).saveAsync({ format: SaveFormat.PNG, base64: true })
  return small.base64 ? pngLuminance(small.base64) : null
}

/** Whether the primary wallpaper is bright (so text over it should be dark), or null without one. */
export const useWallpaperIsLight = (): boolean | null =>
  useWallpapers((s) => {
    const first = s.images[0]
    if (!first) return null
    return (first.luminance ?? 0.5) >= 0.58
  })
