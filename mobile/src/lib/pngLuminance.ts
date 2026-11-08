import { inflate } from 'pako'

// Average perceived brightness of a small PNG, decoded in JavaScript: the same measure the desktop
// takes from a canvas (Rec. 709 weights, alpha ignored), without needing a web page to draw in.
// Handles the PNGs the image manipulator writes: 8-bit, not interlaced, gray/RGB with or without alpha.

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 }

/** Brightness 0–1 of a base64 PNG, or null if it's a kind this doesn't decode. */
export function pngLuminance(base64: string): number | null {
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  let width = 0
  let height = 0
  let channels = 0
  const idat: Uint8Array[] = []
  // Chunks start after the 8-byte signature: length, type, data, CRC.
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    const data = bytes.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(at + 8)
      height = view.getUint32(at + 12)
      const [bitDepth, colorType, , , interlace] = data.subarray(8, 13)
      channels = CHANNELS[colorType] ?? 0
      if (bitDepth !== 8 || interlace !== 0 || !channels) return null
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    at += 12 + length
  }
  if (!width || !height || !idat.length) return null
  const joined = new Uint8Array(idat.reduce((n, d) => n + d.length, 0))
  idat.reduce((offset, d) => (joined.set(d, offset), offset + d.length), 0)
  const raw = inflate(joined)

  // Undo each row's filter (PNG spec §9), then add up the pixels.
  const stride = width * channels
  let prev = new Uint8Array(stride)
  let sum = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const row = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels] : 0
      const up = prev[i]
      const upLeft = i >= channels ? prev[i - channels] : 0
      if (filter === 1) row[i] += left
      else if (filter === 2) row[i] += up
      else if (filter === 3) row[i] += (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        row[i] += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      }
    }
    for (let x = 0; x < width; x++) {
      const i = x * channels
      sum += channels < 3 ? row[i] / 255 : (0.2126 * row[i] + 0.7152 * row[i + 1] + 0.0722 * row[i + 2]) / 255
    }
    prev = row
  }
  return sum / (width * height)
}
