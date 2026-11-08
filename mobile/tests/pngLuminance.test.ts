import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { pngLuminance } from '../src/lib/pngLuminance'

// PNGs built here byte by byte (any valid filters), decoded the way the phone decodes wallpapers.

function crc32(buf: Buffer): number {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** A PNG of `rows` (each row: pixel bytes, unfiltered), with the given filter on every row. */
function png(width: number, colorType: number, rows: number[][], filter = 0): string {
  const channels = { 0: 1, 2: 3, 6: 4 }[colorType]!
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(rows.length, 4)
  ihdr.set([8, colorType, 0, 0, 0], 8)
  const raw: number[] = []
  rows.forEach((row, y) => {
    const prev = y ? rows[y - 1] : row.map(() => 0)
    raw.push(filter)
    row.forEach((v, i) => {
      const left = i >= channels ? row[i - channels] : 0
      const up = prev[i]
      const upLeft = i >= channels ? prev[i - channels] : 0
      const p = left + up - upLeft
      const paeth = Math.abs(p - left) <= Math.abs(p - up) && Math.abs(p - left) <= Math.abs(p - upLeft) ? left : Math.abs(p - up) <= Math.abs(p - upLeft) ? up : upLeft
      const pred = [0, left, up, (left + up) >> 1, paeth][filter]
      raw.push((v - pred) & 0xff)
    })
  })
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from(raw))),
    chunk('IEND', Buffer.alloc(0))
  ]).toString('base64')
}

describe('pngLuminance', () => {
  it('reads white as 1 and black as 0', () => {
    expect(pngLuminance(png(2, 2, [[255, 255, 255, 255, 255, 255]]))).toBeCloseTo(1)
    expect(pngLuminance(png(2, 6, [[0, 0, 0, 255, 0, 0, 0, 255]]))).toBeCloseTo(0)
  })

  it('weights colors like the desktop canvas measure', () => {
    // pure green: 0.7152
    expect(pngLuminance(png(1, 2, [[0, 255, 0]]))).toBeCloseTo(0.7152)
  })

  it.each([0, 1, 2, 3, 4])('undoes row filter %i', (filter) => {
    const rows = [
      [10, 200, 30, 255, 90, 60, 220, 255],
      [250, 5, 128, 255, 33, 77, 199, 255],
      [0, 0, 0, 255, 255, 255, 255, 255]
    ]
    const expected =
      rows.flatMap((r) => [0, 4].map((i) => (0.2126 * r[i] + 0.7152 * r[i + 1] + 0.0722 * r[i + 2]) / 255)).reduce((a, b) => a + b) / 6
    expect(pngLuminance(png(2, 6, rows, filter))).toBeCloseTo(expected, 6)
  })

  it('reads grayscale', () => {
    expect(pngLuminance(png(2, 0, [[51, 153]]))).toBeCloseTo(0.4)
  })
})
