import CookieManager from '@preeternal/react-native-cookie-manager'
import type { Platform } from '@shared/types'
import { evaluate, navigate, readerAvailable, readerUserAgent, slotUrl } from '../lib/reader'

// Mobile version of the desktop's src/main/net.ts. The desktop gives each platform its own browser
// session; here every WebView shares the app's cookie store, and the native cookie manager reads it
// (including HttpOnly cookies page scripts can't see).

export class AuthError extends Error {}

export const partition = (p: Platform): string => `persist:${p}`

/** Sites whose cookies make up each platform's sign-in (cleared on sign-out, carried by Sync). */
export const LOGIN_ORIGINS: Record<Platform, string[]> = {
  twitch: ['https://www.twitch.tv', 'https://twitch.tv', 'https://passport.twitch.tv', 'https://id.twitch.tv', 'https://gql.twitch.tv'],
  youtube: ['https://www.youtube.com', 'https://youtube.com', 'https://accounts.google.com', 'https://www.google.com'],
  kick: ['https://kick.com', 'https://www.kick.com'],
  rumble: ['https://rumble.com', 'https://www.rumble.com']
}

const WEBKIT = { iosCookieStore: 'webKit' } as const

interface CookieFilter {
  url?: string
  domain?: string
  name?: string
}

/** The slice of Electron's Session the providers use: reading cookies and signing out. */
export function sessionFor(p: Platform): {
  cookies: { get(filter: CookieFilter): Promise<{ name: string; value: string; domain?: string }[]> }
  clearStorageData(): Promise<void>
} {
  return {
    cookies: {
      async get({ url, domain, name }) {
        const cookies = await CookieManager.getAsArray(url ?? `https://${domain}`, WEBKIT)
        return cookies.filter((c) => !name || c.name === name).map((c) => ({ name: c.name, value: c.value, domain: c.domain }))
      }
    },
    async clearStorageData() {
      for (const origin of LOGIN_ORIGINS[p]) {
        const cookies = await CookieManager.getAsArray(origin, WEBKIT).catch(() => [])
        for (const c of cookies) await CookieManager.clearByName(origin, c.name, WEBKIT).catch(() => false)
      }
      await CookieManager.flush().catch(() => undefined)
    }
  }
}

export const browserUserAgent = (): string => ''

/**
 * Kick and Rumble requests run inside a page on the platform's own site (like a request the site
 * makes itself), so they carry its sign-in and pass Cloudflare. Twitch's API and YouTube's public
 * pages need no cookies and are fetched directly.
 */
const IN_PAGE: Partial<Record<Platform, string>> = { kick: 'https://kick.com/robots.txt', rumble: 'https://rumble.com/robots.txt' }

const pageReady = new Map<Platform, Promise<void>>()

function fetchPage(p: Platform, origin: string): Promise<void> {
  const key = `${p}:fetch`
  if (slotUrl(key) === origin && pageReady.has(p)) return pageReady.get(p)!
  const ready = navigate(key, p, origin)
  pageReady.set(p, ready)
  ready.catch(() => pageReady.delete(p))
  return ready
}

function plainHeaders(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {}
  if (Array.isArray(h)) return Object.fromEntries(h)
  if (typeof (h as Headers).forEach === 'function') {
    const out: Record<string, string> = {}
    ;(h as Headers).forEach((v, k) => (out[k] = v))
    return out
  }
  return { ...(h as Record<string, string>) }
}

async function inPageFetch(p: Platform, origin: string, url: string, init: RequestInit): Promise<Response> {
  await fetchPage(p, origin)
  const req = { method: init.method ?? 'GET', headers: plainHeaders(init.headers), body: typeof init.body === 'string' ? init.body : undefined }
  const res = await evaluate<{ status: number; text: string }>(
    `${p}:fetch`,
    `fetch(${JSON.stringify(url)}, Object.assign({ credentials: 'include' }, ${JSON.stringify(req)}))
      .then(function (r) { return r.text().then(function (t) { return { status: r.status, text: t } }) })`,
    30_000
  )
  if (!res) {
    // The page may have been reloaded or not be ready yet; load it again next time.
    pageReady.delete(p)
    throw new Error(`${p}: no response for ${url}`)
  }
  return new Response(res.text, { status: res.status >= 200 && res.status <= 599 ? res.status : 500 })
}

/**
 * A request made by the app itself. It goes out as the same desktop browser the page readers are
 * (YouTube, for one, sends the app's own user agent a layout its channel pages can't be read from),
 * and without the reader (background task) it carries the WebViews' cookies.
 */
async function directFetch(p: Platform, url: string, init: RequestInit): Promise<Response> {
  const headers = plainHeaders(init.headers)
  const ua = readerUserAgent(p)
  if (ua && !Object.keys(headers).some((h) => h.toLowerCase() === 'user-agent')) headers['User-Agent'] = ua
  if (IN_PAGE[p]) {
    const cookie = await CookieManager.getCookieHeader(url, WEBKIT).catch(() => '')
    if (cookie) headers.Cookie = cookie
  }
  return fetch(url, { ...init, headers })
}

export async function request(p: Platform, url: string, init: RequestInit = {}): Promise<Response> {
  const origin = IN_PAGE[p]
  const res = origin && readerAvailable() ? await inPageFetch(p, origin, url, init) : await directFetch(p, url, init)
  if (res.status === 401) throw new AuthError(`${p}: session expired`)
  if (!res.ok) throw new Error(`${p}: HTTP ${res.status} for ${url}`)
  return res
}

export async function getJson<T>(p: Platform, url: string, init: RequestInit = {}): Promise<T> {
  const res = await request(p, url, { ...init, headers: { Accept: 'application/json', ...plainHeaders(init.headers) } })
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

export const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))
