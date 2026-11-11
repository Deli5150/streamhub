// Reading game controllers from Linux input devices (main/linuxPads.ts): finding them in
// /proc/bus/input/devices and turning their input events into the Gamepad API's standard layout.

/** A controller's state, in the Gamepad API's standard mapping. */
export interface LinuxPad {
  id: string
  name: string
  /** Standard button indexes held down (0 = A, 1 = B, … 12–15 = d-pad). */
  pressed: number[]
  /** Left stick, -1 to 1. */
  axes: [number, number]
}

/**
 * Input devices that are game controllers, by their event device: those with a joystick handler,
 * or (where the joystick driver isn't loaded) an A button.
 */
export function parseInputDevices(text: string): { event: string; name: string }[] {
  const out: { event: string; name: string }[] = []
  for (const block of text.split(/\n\s*\n/)) {
    const name = /^N: Name="(.*)"$/m.exec(block)?.[1] ?? 'Controller'
    const handlers = /^H: Handlers=(.*)$/m.exec(block)?.[1].trim().split(/\s+/) ?? []
    const keys = /^B: KEY=(.*)$/m.exec(block)?.[1].trim() ?? ''
    const event = handlers.find((h) => /^event\d+$/.test(h))
    if (event && (handlers.some((h) => /^js\d+$/.test(h)) || hasKey(keys, BTN_SOUTH))) out.push({ event, name })
  }
  return out
}

/** Whether a KEY= bitmap (64-bit hex words, highest first) has this key code. */
function hasKey(bitmap: string, code: number): boolean {
  const words = bitmap ? bitmap.split(/\s+/).reverse() : []
  const word = words[Math.floor(code / 64)]
  return word !== undefined && (BigInt(`0x${word}`) >> BigInt(code % 64)) % 2n === 1n
}

const EV_KEY = 1
const BTN_SOUTH = 0x130
const EV_ABS = 3
/** Linux button codes → standard button indexes (Xbox layout, which Steam's virtual pad uses). */
const BUTTONS: Record<number, number> = {
  0x130: 0, // A (south)
  0x131: 1, // B (east)
  0x133: 2, // X (west)
  0x134: 3, // Y (north)
  0x136: 4, // LB
  0x137: 5, // RB
  0x138: 6, // LT (digital)
  0x139: 7, // RT (digital)
  0x13a: 8, // View / Back
  0x13b: 9, // Menu / Start
  0x13d: 10, // left stick
  0x13e: 11, // right stick
  0x220: 12,
  0x221: 13,
  0x222: 14,
  0x223: 15,
  0x13c: 16 // Guide
}
const ABS_X = 0x00
const ABS_Y = 0x01
const ABS_Z = 0x02 // left trigger
const ABS_RZ = 0x05 // right trigger
const ABS_HAT0X = 0x10
const ABS_HAT0Y = 0x11
/** Triggers count as pressed past this (their range is 0–255 on most pads, 0–1023 on some). */
const TRIGGER = 100
/** One input_event on 64-bit Linux: a 16-byte time, then type, code (u16) and value (s32). */
const EVENT_SIZE = 24

/** One controller's state, updated from its event device's bytes. */
export class PadReader {
  private buttons = new Set<number>()
  private hat = { x: 0, y: 0 }
  private triggers = { l: false, r: false }
  private stick: [number, number] = [0, 0]
  private rest = Buffer.alloc(0)

  constructor(
    readonly id: string,
    readonly name: string
  ) {}

  get state(): LinuxPad {
    const pressed = new Set(this.buttons)
    if (this.triggers.l) pressed.add(6)
    if (this.triggers.r) pressed.add(7)
    if (this.hat.y < 0) pressed.add(12)
    if (this.hat.y > 0) pressed.add(13)
    if (this.hat.x < 0) pressed.add(14)
    if (this.hat.x > 0) pressed.add(15)
    return { id: this.id, name: this.name, pressed: [...pressed].sort((a, b) => a - b), axes: [...this.stick] }
  }

  /** Takes the next bytes read; true when the state changed. */
  feed(chunk: Buffer): boolean {
    const data = this.rest.length ? Buffer.concat([this.rest, chunk]) : chunk
    const whole = data.length - (data.length % EVENT_SIZE)
    this.rest = Buffer.from(data.subarray(whole))
    const before = JSON.stringify(this.state)
    for (let at = 0; at < whole; at += EVENT_SIZE) {
      const type = data.readUInt16LE(at + 16)
      const code = data.readUInt16LE(at + 18)
      const value = data.readInt32LE(at + 20)
      if (type === EV_KEY && code in BUTTONS) {
        if (value) this.buttons.add(BUTTONS[code])
        else this.buttons.delete(BUTTONS[code])
      } else if (type === EV_ABS) {
        if (code === ABS_HAT0X) this.hat.x = value
        else if (code === ABS_HAT0Y) this.hat.y = value
        else if (code === ABS_Z) this.triggers.l = value > TRIGGER
        else if (code === ABS_RZ) this.triggers.r = value > TRIGGER
        else if (code === ABS_X) this.stick[0] = stickValue(value)
        else if (code === ABS_Y) this.stick[1] = stickValue(value)
      }
    }
    return JSON.stringify(this.state) !== before
  }
}

/** Sticks report -32768 to 32767. */
const stickValue = (v: number): number => Math.max(-1, Math.min(1, v / 32767))
