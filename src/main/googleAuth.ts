import { net, shell } from 'electron'
import crypto from 'node:crypto'
import http from 'node:http'
import { AuthError } from './net'
import { store } from './store'

// Google sign-in with Google's official flow for desktop apps: the sign-in page opens in the
// user's own browser (Google blocks sign-in inside embedded app windows), Google redirects back to
// a one-off listener on 127.0.0.1, and the code it carries is exchanged (with PKCE) for tokens.
// Only the refresh token is kept, encrypted by the OS (see store.setSecret).
// Two independent sign-ins use it: YouTube (read your subscriptions) and Sync (StreamHub's own file
// in your Drive's hidden app folder; see sync.ts), so either can be signed out without the other.
// The OAuth client comes from a Google Cloud project; see README → "YouTube sign-in setup".

const CLIENT_ID = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID ?? ''
// Google issues desktop clients a "secret" that, by design, isn't secret (it ships in every copy);
// PKCE is what protects the sign-in.
const CLIENT_SECRET = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET ?? ''
/** How long to wait for the user to finish signing in in their browser. */
const SIGN_IN_TIMEOUT_MS = 5 * 60_000

interface Saved {
  refreshToken: string
}

export const googleConfigured = (): boolean => Boolean(CLIENT_ID)

/** A PKCE verifier and its S256 challenge. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(48).toString('base64url')
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') }
}

/** Google's consent page URL for this app. */
export function authUrl(p: { clientId: string; redirectUri: string; challenge: string; state: string; scope: string }): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: p.scope,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    state: p.state,
    // A refresh token, so the user signs in once rather than every hour.
    access_type: 'offline',
    prompt: 'consent'
  }).toString()
  return url.toString()
}

interface AccountOptions {
  scope: string
  /** Where the refresh token is kept (store secrets). */
  secretKey: string
  /** What it's for, in messages ("YouTube", "Sync"). */
  label: string
  /** Error prefix for API failures. */
  errorPrefix: string
}

export interface GoogleAccount {
  /** Whether signed in. Checked often (e.g. for every state update), so it never decrypts. */
  signedIn(): boolean
  /** Opens Google's sign-in in the browser and waits for the user to finish there. */
  signIn(): Promise<void>
  /** Forgets the sign-in and asks Google to revoke it. */
  signOut(): Promise<void>
  /** Fetches a Google API URL as the signed-in user. Throws AuthError when the sign-in is gone. */
  fetch(url: string, init?: RequestInit): Promise<Response>
  /** GET a Google API URL as JSON. */
  get<T>(url: string): Promise<T>
}

/** One Google sign-in, for one purpose (scope). */
export function googleAccount({ scope, secretKey, label, errorPrefix }: AccountOptions): GoogleAccount {
  let access: { token: string; expiresAt: number } | null = null

  async function accessToken(): Promise<string> {
    if (access && Date.now() < access.expiresAt - 60_000) return access.token
    const saved = await store.getSecret<Saved>(secretKey)
    if (!saved?.refreshToken) throw new AuthError(`${errorPrefix}: not signed in`)
    try {
      const tokens = await tokenRequest({ refresh_token: saved.refreshToken, grant_type: 'refresh_token' }, label)
      access = { token: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 }
      return access.token
    } catch (e) {
      // invalid_grant: revoked, or expired (Google expires them after 7 days while the Cloud
      // project's consent screen is still in "Testing").
      if (/invalid_grant/.test((e as Error).message)) {
        await store.setSecret(secretKey, null)
        throw new AuthError(`${errorPrefix}: sign-in expired`)
      }
      throw e
    }
  }

  async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${await accessToken()}`)
      const res = await net.fetch(url, { ...init, headers })
      if (res.status === 401 && attempt === 0) {
        access = null // expired early or revoked; refresh once and retry
        continue
      }
      if (res.status === 401) throw new AuthError(`${errorPrefix}: sign-in expired`)
      return res
    }
  }

  return {
    signedIn: () => store.hasSecret(secretKey),

    async signIn() {
      if (!CLIENT_ID) {
        throw new Error(`${label} sign-in isn't set up in this copy of StreamHub (it needs a Google OAuth client ID — see README → YouTube sign-in setup)`)
      }
      const { verifier, challenge } = pkcePair()
      const state = crypto.randomBytes(16).toString('base64url')
      const { redirectUri, code } = await receiveCode(
        (redirectUri) => void shell.openExternal(authUrl({ clientId: CLIENT_ID, redirectUri, challenge, state, scope })),
        state,
        label
      )
      const tokens = await tokenRequest({ code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirectUri }, label)
      if (!tokens.refresh_token) throw new Error('Google did not grant offline access — try connecting again')
      await store.setSecret(secretKey, { refreshToken: tokens.refresh_token } satisfies Saved)
      access = { token: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 }
    },

    async signOut() {
      const saved = await store.getSecret<Saved>(secretKey)
      await store.setSecret(secretKey, null)
      access = null
      if (saved?.refreshToken) {
        await net
          .fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(saved.refreshToken)}`, { method: 'POST' })
          .catch(() => undefined)
      }
    },

    fetch: authFetch,

    async get<T>(url: string): Promise<T> {
      const res = await authFetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(`${errorPrefix}: ${body?.error?.message ?? `HTTP ${res.status}`}`)
      }
      return (await res.json()) as T
    }
  }
}

/** YouTube: read-only access to your subscriptions. */
const youtubeAccount = googleAccount({ scope: 'https://www.googleapis.com/auth/youtube.readonly', secretKey: 'google-oauth', label: 'YouTube', errorPrefix: 'youtube' })
export const googleSignedIn = youtubeAccount.signedIn
export const googleSignIn = youtubeAccount.signIn
export const googleSignOut = youtubeAccount.signOut
export const googleGet = youtubeAccount.get

async function tokenRequest(params: Record<string, string>, label: string): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
  const res = await net.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...(CLIENT_SECRET ? { client_secret: CLIENT_SECRET } : {}), ...params }).toString()
  })
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string }
  if (!res.ok || !json.access_token) throw new Error(`${label} sign-in failed: ${json.error ?? res.status}${json.error_description ? ` (${json.error_description})` : ''}`)
  return { access_token: json.access_token, expires_in: json.expires_in ?? 3600, refresh_token: json.refresh_token }
}

/**
 * Listens on a random 127.0.0.1 port for Google's redirect, calls `open` with the redirect URI to
 * send the user off, and resolves with the authorization code once they come back.
 */
function receiveCode(open: (redirectUri: string) => void, state: string, label: string): Promise<{ redirectUri: string; code: string }> {
  return new Promise((resolve, reject) => {
    let redirectUri = ''
    const done = (err: Error | null, code?: string): void => {
      clearTimeout(timer)
      server.close()
      if (err) reject(err)
      else resolve({ redirectUri, code: code! })
    }
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', redirectUri)
      if (url.pathname !== '/') return void res.writeHead(404).end()
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      const ok = Boolean(code) && url.searchParams.get('state') === state
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(resultPage(ok, error, label))
      if (ok) done(null, code!)
      else done(new Error(error === 'access_denied' ? `${label} sign-in was cancelled` : `${label} sign-in failed${error ? `: ${error}` : ''}`))
    })
    const timer = setTimeout(() => done(new Error(`${label} sign-in timed out — try again`)), SIGN_IN_TIMEOUT_MS)
    server.on('error', (e) => done(e))
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      redirectUri = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
      open(redirectUri)
    })
  })
}

/** What the browser tab shows after Google sends the user back. */
function resultPage(ok: boolean, error: string | null, label: string): string {
  const [title, text] = ok
    ? [label === 'YouTube' ? 'Signed in to YouTube' : `StreamHub ${label} is on`, 'You can close this tab and return to StreamHub.']
    : [`${label} sign-in didn’t finish`, error === 'access_denied' ? 'Access wasn’t allowed. You can close this tab and try again from StreamHub.' : 'Something went wrong. You can close this tab and try again from StreamHub.']
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<style>body{font:15px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#111;color:#eee}
main{text-align:center;max-width:26rem;padding:2rem}h1{font-size:20px;margin:0 0 .5rem}p{color:#aaa;margin:0}</style>
<main><h1>${title}</h1><p>${text}</p></main>`
}
