import { describe, expect, it } from 'vitest'
import { decodeMessage, encodeMessage, NS, readFrames } from '../src/main/castProtocol'

describe('Cast protocol messages', () => {
  const msg = { source: 'sender-0', destination: 'receiver-0', namespace: NS.receiver, payload: JSON.stringify({ type: 'GET_STATUS', requestId: 1 }) }

  it('round-trips a message', () => {
    const framed = encodeMessage(msg)
    expect(framed.readUInt32BE(0)).toBe(framed.length - 4)
    expect(decodeMessage(framed.subarray(4))).toEqual(msg)
  })

  it('lays out the protobuf the way Cast devices expect', () => {
    const body = encodeMessage({ source: 'a', destination: 'b', namespace: 'c', payload: 'd' }).subarray(4)
    // version=0, source "a", destination "b", namespace "c", payload_type=STRING, payload "d"
    expect([...body]).toEqual([0x08, 0x00, 0x12, 1, 0x61, 0x1a, 1, 0x62, 0x22, 1, 0x63, 0x28, 0x00, 0x32, 1, 0x64])
  })

  it('handles payloads longer than 127 bytes (multi-byte lengths)', () => {
    const long = { ...msg, payload: JSON.stringify({ type: 'LOAD', media: { contentId: 'https://example.com/'.padEnd(400, 'x') } }) }
    expect(decodeMessage(encodeMessage(long).subarray(4))).toEqual(long)
  })

  it('splits a byte stream into messages, keeping a partial one for later', () => {
    const a = encodeMessage(msg)
    const b = encodeMessage({ ...msg, payload: '{"type":"PONG"}' })
    const stream = Buffer.concat([a, b])
    const first = readFrames(stream.subarray(0, a.length + 5))
    expect(first.messages).toHaveLength(1)
    const second = readFrames(Buffer.concat([first.rest, stream.subarray(a.length + 5)]))
    expect(second.messages.map((m) => m.payload)).toEqual(['{"type":"PONG"}'])
    expect(second.rest.length).toBe(0)
  })
})
