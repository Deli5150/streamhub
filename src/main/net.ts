import { session, type Session } from 'electron'
import type { Platform } from '@shared/types'

export class AuthError extends Error {}

/** One persistent session per platform, shared by login windows, API calls and <webview>s. */
export const partition = (p: Platform): string => `persist:${p}`
export const sessionFor = (p: Platform): Session => session.fromPartition(partition(p))

/** Chrome UA without the "Electron/x" token, so Cloudflare-fronted sites treat us like a browser. */
export function browserUserAgent(): string {
  return session.defaultSession
    .getUserAgent()
    .replace(/\s*Electron\/\S+/, '')
    .replace(/\s*streamhub\/\S+/i, '')
}

export async function request(p: Platform, url: string, init: RequestInit = {}): Promise<Response> {
  // `include` makes Electron attach the platform session's cookies (the signed-in state).
  const res = await sessionFor(p).fetch(url, { credentials: 'include', ...init })
  if (res.status === 401) throw new AuthError(`${p}: session expired`)
  if (!res.ok) throw new Error(`${p}: HTTP ${res.status} for ${url}`)
  return res
}

export async function getJson<T>(p: Platform, url: string, init: RequestInit = {}): Promise<T> {
  const res = await request(p, url, { ...init, headers: { Accept: 'application/json', ...init.headers } })
  return (await res.json()) as T
}

export async function getText(p: Platform, url: string, init: RequestInit = {}): Promise<string> {
  return (await request(p, url, init)).text()
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export const chunk = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))
