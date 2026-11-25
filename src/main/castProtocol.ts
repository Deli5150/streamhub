import { EventEmitter } from 'node:events'
import tls from 'node:tls'

// The Google Cast protocol ("CASTV2"), as much of it as casting a video takes: a TLS connection to
// the TV on port 8009 carrying length-prefixed CastMessage protobufs whose payloads are JSON. Kept
// free of Electron so it can be tested on its own (tests/castProtocol.test.ts).

export const NS = {
  connection: 'urn:x-cast:com.google.cast.tp.connection',
  heartbeat: 'urn:x-cast:com.google.cast.tp.heartbeat',
  receiver: 'urn:x-cast:com.google.cast.receiver',
  media: 'urn:x-cast:com.google.cast.media'
} as const

export interface CastMessage {
  source: string
  destination: string
  namespace: string
  payload: string
}

// ── CastMessage protobuf ──────────────────────────────────────────────────────────────────────
// 1 protocol_version (enum, 0 = CASTV2_1_0), 2 source_id, 3 destination_id, 4 namespace,
// 5 payload_type (enum, 0 = STRING), 6 payload_utf8.

function varint(n: number): number[] {
  const out: number[] = []
  do {
    let b = n & 0x7f
    n >>>= 7
    if (n) b |= 0x80
    out.push(b)
  } while (n)
  return out
}

function stringField(field: number, value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8')
  return Buffer.concat([Buffer.from([(field << 3) | 2, ...varint(bytes.length)]), bytes])
}

/** One message, framed: a 4-byte big-endian length, then the protobuf. */
export function encodeMessage(m: CastMessage): Buffer {
  const body = Buffer.concat([
    Buffer.from([0x08, 0x00]),
    stringField(2, m.source),
    stringField(3, m.destination),
    stringField(4, m.namespace),
    Buffer.from([0x28, 0x00]),
    stringField(6, m.payload)
  ])
  const head = Buffer.alloc(4)
  head.writeUInt32BE(body.length)
  return Buffer.concat([head, body])
}

/** A CastMessage's protobuf (without the length prefix). */
export function decodeMessage(buf: Buffer): CastMessage {
  const m: CastMessage = { source: '', destination: '', namespace: '', payload: '' }
  let i = 0
  const readVarint = (): number => {
    let n = 0
    let shift = 0
    for (;;) {
      const b = buf[i++]
      n += (b & 0x7f) * 2 ** shift
      if (!(b & 0x80)) return n
      shift += 7
    }
  }
  while (i < buf.length) {
    const tag = readVarint()
    const field = tag >>> 3
    const wire = tag & 7
    if (wire === 0) {
      readVarint()
      continue
    }
    if (wire !== 2) throw new Error(`unexpected wire type ${wire}`)
    const len = readVarint()
    const value = buf.subarray(i, i + len)
    i += len
    if (field === 2) m.source = value.toString('utf8')
    else if (field === 3) m.destination = value.toString('utf8')
    else if (field === 4) m.namespace = value.toString('utf8')
    else if (field === 6) m.payload = value.toString('utf8')
  }
  return m
}

/** Splits a stream of bytes into messages; returns them and what's left over. */
export function readFrames(buf: Buffer): { messages: CastMessage[]; rest: Buffer } {
  const messages: CastMessage[] = []
  let off = 0
  while (buf.length - off >= 4) {
    const len = buf.readUInt32BE(off)
    if (buf.length - off - 4 < len) break
    messages.push(decodeMessage(buf.subarray(off + 4, off + 4 + len)))
    off += 4 + len
  }
  return { messages, rest: buf.subarray(off) }
}

// ── A connection to one TV ────────────────────────────────────────────────────────────────────

type Json = Record<string, unknown> & { type?: string; requestId?: number }

/**
 * A connection to a TV. Emits 'message' (namespace, source, JSON payload) and 'close'. Answers the
 * TV's heartbeat and sends its own, which the TV needs to keep the connection open.
 */
export class CastConnection extends EventEmitter {
  private socket: tls.TLSSocket | null = null
  private buffer = Buffer.alloc(0)
  private nextId = 1
  private beat: ReturnType<typeof setInterval> | null = null
  private waiting = new Map<number, { resolve(j: Json): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }>()

  async open(host: string, port = 8009): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      // Cast devices use certificates of their own that no public authority signs.
      const socket = tls.connect({ host, port, rejectUnauthorized: false }, () => resolve())
      socket.setTimeout(15_000, () => socket.destroy(new Error('The TV stopped answering')))
      socket.once('error', reject)
      this.socket = socket
    })
    const socket = this.socket!
    socket.setTimeout(0)
    socket.on('error', () => undefined)
    socket.on('data', (chunk: Buffer) => {
      const { messages, rest } = readFrames(Buffer.concat([this.buffer, chunk]))
      this.buffer = Buffer.from(rest)
      for (const m of messages) this.receive(m)
    })
    socket.on('close', () => this.closed())
    this.send(NS.connection, 'receiver-0', { type: 'CONNECT' })
    this.beat = setInterval(() => this.send(NS.heartbeat, 'receiver-0', { type: 'PING' }), 5000)
  }

  get isOpen(): boolean {
    return Boolean(this.socket && !this.socket.destroyed)
  }

  send(namespace: string, destination: string, payload: Json): void {
    this.socket?.write(encodeMessage({ source: 'sender-0', destination, namespace, payload: JSON.stringify(payload) }))
  }

  /** Sends a request and resolves with the reply that carries its requestId. */
  request(namespace: string, destination: string, payload: Json, timeoutMs = 20_000): Promise<Json> {
    const requestId = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(requestId)
        reject(new Error('The TV didn’t answer'))
      }, timeoutMs)
      this.waiting.set(requestId, { resolve, reject, timer })
      this.send(namespace, destination, { ...payload, requestId })
    })
  }

  close(): void {
    this.socket?.destroy()
  }

  private receive(m: CastMessage): void {
    let j: Json
    try {
      j = JSON.parse(m.payload) as Json
    } catch {
      return
    }
    if (m.namespace === NS.heartbeat && j.type === 'PING') return this.send(NS.heartbeat, m.source, { type: 'PONG' })
    if (m.namespace === NS.connection && j.type === 'CLOSE') return void this.emit('message', m.namespace, m.source, j)
    const w = typeof j.requestId === 'number' && j.requestId > 0 ? this.waiting.get(j.requestId) : undefined
    if (w) {
      clearTimeout(w.timer)
      this.waiting.delete(j.requestId!)
      w.resolve(j)
    }
    this.emit('message', m.namespace, m.source, j)
  }

  private closed(): void {
    if (this.beat) clearInterval(this.beat)
    this.beat = null
    this.socket = null
    for (const w of this.waiting.values()) {
      clearTimeout(w.timer)
      w.reject(new Error('The connection to the TV closed'))
    }
    this.waiting.clear()
    this.emit('close')
  }
}
