import { beforeEach, describe, expect, it, vi } from 'vitest'

// The wallpaper store with the phone's native modules faked: a photo library that returns what the
// test picked, and a files folder the test can look into.

const files = new Set<string>()
let picked: { uri: string; width: number; height: number }[] = []
let measured: number | null = 0.7

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => undefined } }))
vi.mock('expo-crypto', () => {
  let n = 0
  return { randomUUID: () => `id${++n}` }
})
vi.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: { Current: 'current' },
  launchImageLibraryAsync: async (o: { selectionLimit: number }) => ({ canceled: false, assets: picked.slice(0, o.selectionLimit) })
}))
vi.mock('expo-image-manipulator', () => {
  const context = (uri: string) => ({
    resize: () => context(uri),
    renderAsync: async () => ({ saveAsync: async () => ({ uri, base64: 'AAAA' }) })
  })
  return { ImageManipulator: { manipulate: context }, SaveFormat: { JPEG: 'jpeg', PNG: 'png' } }
})
vi.mock('expo-file-system', () => {
  class Directory {
    constructor(public base: unknown, public name: string) {}
    create(): void {}
  }
  class File {
    name: string
    constructor(a: unknown, b?: string) {
      this.name = b ?? String(a)
    }
    get uri(): string {
      return `file:///docs/wallpapers/${this.name}`
    }
    get exists(): boolean {
      return files.has(this.name)
    }
    copy(dest: File): void {
      files.add(dest.name)
    }
    delete(): void {
      files.delete(this.name)
    }
  }
  return { Directory, File, Paths: { document: 'docs' } }
})
vi.mock('../src/lib/pngLuminance', () => ({ pngLuminance: () => measured }))

const { useWallpapers, MAX_WALLPAPERS } = await import('../src/lib/wallpapers')
const photo = (n: number) => ({ uri: `file:///tmp/p${n}.jpg`, width: 4000, height: 3000 })

beforeEach(() => {
  files.clear()
  measured = 0.7
  useWallpapers.setState({ images: [], multiEnabled: false, fit: 'cover', zoom: 1, rotation: 0 })
})

describe('wallpapers', () => {
  it('with one wallpaper, a new photo replaces the old one and its file', async () => {
    picked = [photo(1)]
    await useWallpapers.getState().pick()
    const first = useWallpapers.getState().images[0].file
    picked = [photo(2)]
    await useWallpapers.getState().pick()
    const { images } = useWallpapers.getState()
    expect(images).toHaveLength(1)
    expect(images[0].file).not.toBe(first)
    expect([...files]).toEqual([images[0].file])
  })

  it('keeps each photo’s measured brightness', async () => {
    picked = [photo(1)]
    measured = 0.2
    await useWallpapers.getState().pick()
    expect(useWallpapers.getState().images[0].luminance).toBe(0.2)
  })

  it('with several wallpapers, adds up to the limit', async () => {
    useWallpapers.getState().update({ multiEnabled: true })
    picked = Array.from({ length: 7 }, (_, i) => photo(i))
    await useWallpapers.getState().pick()
    await useWallpapers.getState().pick()
    expect(useWallpapers.getState().images).toHaveLength(MAX_WALLPAPERS)
    expect(await useWallpapers.getState().pick()).toEqual({ added: 0, skipped: 0 })
  })

  it('removing a wallpaper deletes its file', async () => {
    useWallpapers.getState().update({ multiEnabled: true })
    picked = [photo(1), photo(2)]
    await useWallpapers.getState().pick()
    const [a, b] = useWallpapers.getState().images
    useWallpapers.getState().remove(0)
    expect(useWallpapers.getState().images).toEqual([b])
    expect(files.has(a.file)).toBe(false)
    useWallpapers.getState().clear()
    expect(files.size).toBe(0)
  })
})
