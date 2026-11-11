import { describe, expect, it } from 'vitest'
import { PadReader, parseInputDevices } from '../src/shared/linuxPads'

// A Steam Deck in Game Mode: its built-in controls (taken over by Steam) and Steam's virtual pad.
const DEVICES = `I: Bus=0003 Vendor=28de Product=1205 Version=0111
N: Name="Valve Software Steam Deck Controller"
H: Handlers=sysrq kbd leds event7
B: EV=120013

I: Bus=0003 Vendor=28de Product=11ff Version=0001
N: Name="Microsoft X-Box 360 pad 0"
H: Handlers=event21 js0
B: EV=20000b

I: Bus=0019 Vendor=0000 Product=0001 Version=0000
N: Name="Power Button"
H: Handlers=kbd event0
B: KEY=10000000000000 0

I: Bus=0005 Vendor=045e Product=0b13 Version=0509
N: Name="Xbox Wireless Controller"
H: Handlers=event24
B: KEY=7cdb000000000000 0 0 0 0
`

const ev = (type: number, code: number, value: number): Buffer => {
  const b = Buffer.alloc(24)
  b.writeUInt16LE(type, 16)
  b.writeUInt16LE(code, 18)
  b.writeInt32LE(value, 20)
  return b
}

describe('parseInputDevices', () => {
  it('finds the controllers (devices with a joystick handler)', () => {
    expect(parseInputDevices(DEVICES)).toEqual([
      { event: 'event21', name: 'Microsoft X-Box 360 pad 0' },
      // No joystick driver: found by its A button.
      { event: 'event24', name: 'Xbox Wireless Controller' }
    ])
  })
})

describe('PadReader', () => {
  it('reads buttons, the d-pad, triggers and the stick', () => {
    const r = new PadReader('event21', 'pad')
    expect(r.feed(Buffer.concat([ev(1, 0x130, 1), ev(3, 0x11, -1), ev(3, 0x05, 255), ev(3, 0x00, -32768), ev(0, 0, 0)]))).toBe(true)
    expect(r.state.pressed).toEqual([0, 7, 12])
    expect(r.state.axes).toEqual([-1, 0])
    r.feed(Buffer.concat([ev(1, 0x130, 0), ev(3, 0x11, 0), ev(3, 0x05, 0)]))
    expect(r.state.pressed).toEqual([])
  })

  it('keeps an event split across reads', () => {
    const r = new PadReader('event21', 'pad')
    const b = ev(1, 0x131, 1)
    expect(r.feed(b.subarray(0, 10))).toBe(false)
    expect(r.feed(b.subarray(10))).toBe(true)
    expect(r.state.pressed).toEqual([1])
  })

  it('ignores sync events and unchanged values', () => {
    const r = new PadReader('event21', 'pad')
    expect(r.feed(ev(0, 0, 0))).toBe(false)
  })
})
