import { useEffect, useState } from 'react'
import { create } from 'zustand'

// Home-screen wallpapers. Images are data URLs kept in IndexedDB (too large for localStorage);
// the small fit/zoom/rotation settings live in localStorage.

export const MAX_WALLPAPERS = 10
export type BackgroundFit = 'cover' | 'contain' | 'fill'

export interface BackgroundSettings {
  fit: BackgroundFit
  zoom: number
  rotation: number
  /** Several wallpapers that crossfade. */
  multiEnabled: boolean
}

const SETTINGS_KEY = 'streamhub:home-bg'
const DEFAULTS: BackgroundSettings = { fit: 'cover', zoom: 1, rotation: 0, multiEnabled: false }

function readSettings(): BackgroundSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

// ---------- IndexedDB ----------

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('streamhub', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction('kv', mode).objectStore('kv'))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

const IMAGES_KEY = 'home-bg-images'

interface BackgroundState extends BackgroundSettings {
  images: string[]
  loaded: boolean
  load(): Promise<void>
  setImages(images: string[]): Promise<void>
  update(patch: Partial<BackgroundSettings>): void
}

export const useBackground = create<BackgroundState>((set, get) => ({
  ...readSettings(),
  images: [],
  loaded: false,
  async load() {
    if (get().loaded) return
    const images = (await idb<string[] | undefined>('readonly', (s) => s.get(IMAGES_KEY)).catch(() => undefined)) ?? []
    set({ images, loaded: true })
  },
  async setImages(images) {
    await idb('readwrite', (s) => s.put(images.slice(0, MAX_WALLPAPERS), IMAGES_KEY))
    set({ images: images.slice(0, MAX_WALLPAPERS) })
  },
  update(patch) {
    const { fit, zoom, rotation, multiEnabled } = { ...get(), ...patch }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fit, zoom, rotation, multiEnabled }))
    set(patch)
  }
}))

export const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })

/** Average perceived brightness (0–1) of an image, from a 32×32 downsample. */
function luminance(src: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = 32
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0, 32, 32)
      const d = ctx.getImageData(0, 0, 32, 32).data
      let sum = 0
      for (let i = 0; i < d.length; i += 4) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255
      resolve(sum / (d.length / 4))
    }
    img.onerror = () => resolve(0.5)
    img.src = src
  })
}

/** Whether the primary wallpaper is bright (so text over it should be dark), or null without one. */
export function useWallpaperIsLight(): boolean | null {
  const first = useBackground((s) => s.images[0])
  const [light, setLight] = useState<boolean | null>(null)
  useEffect(() => {
    if (!first) return setLight(null)
    let cancelled = false
    luminance(first).then((l) => !cancelled && setLight(l >= 0.58))
    return () => {
      cancelled = true
    }
  }, [first])
  return light
}
