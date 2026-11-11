import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import type { WebContents } from 'electron'
import { parseInputDevices, PadReader, type LinuxPad } from '@shared/linuxPads'

// Controllers read straight from Linux's input devices, for Steam's Game Mode. There the controller
// reaches apps as Steam's virtual gamepad, and Chromium's Gamepad API doesn't always pass it on (nor
// does it count the window as focused under gamescope), which left Big Picture with no controller.
// Each gamepad's /dev/input/event* device is read by a `cat` (a blocking read in Node would hold
// one of its few worker threads for good) and its state goes to the window as `linux-pad`. The page
// uses these only while the Gamepad API itself has no controller (lib/bigPicture.ts).

const RESCAN_MS = 3000

/** Reads the controllers into `contents` until the returned function is called. */
export function startLinuxPads(contents: WebContents): () => void {
  const readers = new Map<string, { proc: ChildProcess; reader: PadReader }>()
  const send = (pads: LinuxPad[]): void => {
    if (!contents.isDestroyed()) contents.send('linux-pad', pads)
  }
  const sendAll = (): void => send([...readers.values()].map((r) => r.reader.state))

  const scan = (): void => {
    let devices: ReturnType<typeof parseInputDevices>
    try {
      devices = parseInputDevices(fs.readFileSync('/proc/bus/input/devices', 'utf8'))
    } catch {
      return
    }
    for (const d of devices) {
      if (readers.has(d.event)) continue
      const path = `/dev/input/${d.event}`
      const proc = spawn('cat', [path], { stdio: ['ignore', 'pipe', 'pipe'] })
      const reader = new PadReader(d.event, d.name)
      readers.set(d.event, { proc, reader })
      console.log(`[pads] reading ${d.name} (${path})`)
      proc.stdout?.on('data', (chunk: Buffer) => {
        if (reader.feed(chunk)) sendAll()
      })
      proc.stderr?.on('data', (b: Buffer) => console.warn(`[pads] ${path}: ${b.toString().trim()}`))
      proc.on('exit', () => {
        readers.delete(d.event)
        sendAll()
      })
    }
  }

  scan()
  const timer = setInterval(scan, RESCAN_MS)
  return () => {
    clearInterval(timer)
    for (const { proc } of readers.values()) proc.kill()
    readers.clear()
  }
}
