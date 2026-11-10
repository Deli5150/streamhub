import { PLATFORMS, type Platform } from '@shared/types'
import { visitPage } from './hidden'
import { sessionFor } from './net'

// Keeps the platforms' website sign-ins (Twitch, Kick, Rumble; YouTube's is a Google sign-in) from
// running out. A browser stays signed in because the sites renew their cookies while you use them and
// the browser keeps them; StreamHub mostly talks to the sites' APIs, so it does the same on purpose:
// - every signed-in site is opened in the background at launch and every 12 hours;
// - cookies meant to last only "until the browser closes" are kept across restarts;
// - a request that comes back signed out first tries to recover (a visit to the site, then the
//   newest sign-in from Sync with Google) before the account is reported as expired.

const HOME: Partial<Record<Platform, string>> = {
  twitch: 'https://www.twitch.tv/',
  kick: 'https://kick.com/',
  rumble: 'https://rumble.com/'
}
const KEEPALIVE_MS = 12 * 60 * 60_000
const FIRST_KEEPALIVE_MS = 60_000
/** Session cookies are kept this long (renewed whenever the site sets them again). */
const KEEP_SESSION_COOKIES_S = 30 * 24 * 60 * 60
/** One recovery attempt per platform at a time, and not again for a while if it didn't help. */
const RECOVER_COOLDOWN_MS = 10 * 60_000

let fromSync: (p: Platform) => Promise<void> = async () => {}
const recovering = new Map<Platform, Promise<boolean>>()
const lastRecovery = new Map<Platform, number>()

/** Opens the platform's site in the background so it renews its sign-in. */
export const refreshSession = (p: Platform): Promise<void> => (HOME[p] ? visitPage(p, HOME[p]!) : Promise.resolve())

/**
 * After a signed-out answer: renews the session (site visit), then takes the newest sign-in from
 * Sync with Google. Resolves true when it's worth trying the request again.
 */
export function recoverSession(p: Platform): Promise<boolean> {
  const running = recovering.get(p)
  if (running) return running
  if (Date.now() - (lastRecovery.get(p) ?? 0) < RECOVER_COOLDOWN_MS) return Promise.resolve(false)
  lastRecovery.set(p, Date.now())
  const run = (async () => {
    console.log(`[${p}] signed out — renewing the session before reporting it`)
    await refreshSession(p).catch(() => {})
    await fromSync(p).catch(() => {})
    return true
  })().finally(() => recovering.delete(p))
  recovering.set(p, run)
  return run
}

/** Cookies set "for this browser session" become lasting ones, as a browser restoring its tabs keeps them. */
function keepSessionCookies(p: Platform): void {
  const jar = sessionFor(p).cookies
  jar.on('changed', (_e, cookie, _cause, removed) => {
    if (removed || !cookie.session || !cookie.domain) return
    const host = cookie.domain.replace(/^\./, '')
    jar
      .set({
        url: `https://${host}${cookie.path || '/'}`,
        name: cookie.name,
        value: cookie.value,
        ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expirationDate: Date.now() / 1000 + KEEP_SESSION_COOKIES_S
      })
      .catch(() => {})
  })
}

/**
 * Starts keeping sign-ins alive. `syncLogin` brings in the newest sign-in for a platform from Sync
 * with Google (when it's on).
 */
export function startSessionKeeper(isConnected: (p: Platform) => boolean, syncLogin: (p: Platform) => Promise<void>): void {
  fromSync = syncLogin
  for (const p of PLATFORMS) keepSessionCookies(p)
  const keepAlive = (): void => {
    for (const p of PLATFORMS) if (HOME[p] && isConnected(p)) void refreshSession(p).catch(() => {})
  }
  setTimeout(keepAlive, FIRST_KEEPALIVE_MS)
  setInterval(keepAlive, KEEPALIVE_MS)
}

/** Writes every platform's cookies to disk (before quitting, so nothing renewed is lost). */
export const flushCookies = (): Promise<unknown> => Promise.all(PLATFORMS.map((p) => sessionFor(p).cookies.flushStore().catch(() => {})))
