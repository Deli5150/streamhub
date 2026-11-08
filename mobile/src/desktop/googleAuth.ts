import { Platform as OS } from 'react-native'
import { GoogleSignin, isCancelledResponse, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin'
import { GOOGLE_WEB_UA } from '../lib/reader'
import { AuthError, sessionFor } from './net'
import { store } from './store'
import { loginWindow } from './providerTypes'

// Mobile version of the desktop's src/main/googleAuth.ts: Google's own sign-in for iOS and Android,
// which keeps the sign-in and refreshes access itself, gives read-only access to your subscriptions
// (YouTube) and to StreamHub's own file in your Drive (Sync with Google). The phone has one Google
// sign-in for both, each feature adding its permission, so turning one off leaves the other signed in.
// It doesn't sign in web pages, so YouTube's chat is signed in separately on youtube.com in the app
// (signInToYouTubeWeb), the way the other platforms sign in. The OAuth clients come from your
// Google Cloud project (see mobile/README.md → YouTube sign-in).

const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? ''

let configured = false
function configure(): void {
  if (configured) return
  configured = true
  // Each feature asks for its own permission when turned on (addScopes).
  GoogleSignin.configure({ scopes: [], ...(IOS_CLIENT_ID ? { iosClientId: IOS_CLIENT_ID } : {}) })
}

export const googleConfigured = (): boolean => OS.OS === 'android' || Boolean(IOS_CLIENT_ID)

/** Whether YouTube is connected: signed in to Google and connected from YouTube's own button. */
export function googleSignedIn(): boolean {
  configure()
  return GoogleSignin.hasPreviousSignIn() && Boolean(store.get('usernames').youtube)
}

/** Signs in to Google if needed and makes sure `scope` is granted. */
async function signInWith(scope: string, label: string): Promise<void> {
  configure()
  if (OS.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  let scopes: string[]
  if (GoogleSignin.hasPreviousSignIn()) {
    const res = await GoogleSignin.signInSilently()
    if (res.type !== 'success') {
      const again = await GoogleSignin.signIn()
      if (isCancelledResponse(again)) throw new Error(`${label} sign-in was cancelled`)
      scopes = again.data.scopes
    } else scopes = res.data.scopes
  } else {
    const res = await GoogleSignin.signIn()
    if (isCancelledResponse(res)) throw new Error(`${label} sign-in was cancelled`)
    scopes = res.data.scopes
  }
  if (!scopes.includes(scope)) {
    const added = await GoogleSignin.addScopes({ scopes: [scope] })
    if (!added || isCancelledResponse(added) || !added.data.scopes.includes(scope)) throw new Error(`${label} access wasn’t allowed — try again`)
  }
}

/** Why Google's sign-in failed, in words (Android needs its own OAuth client in the Cloud project). */
function signInError(e: unknown, label: string): Error {
  if (isErrorWithCode(e)) {
    if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return new Error(`${label} needs Google Play services`)
    if (OS.OS === 'android' && /DEVELOPER_ERROR|10:/.test(String(e.message))) {
      return new Error(`${label} isn’t set up for Android yet: it needs an Android OAuth client in StreamHub’s Google Cloud project (see the mobile README → Sync with Google)`)
    }
  }
  return e instanceof Error ? e : new Error(String(e))
}

/** Sync with Google: signs in with access to StreamHub's file in your Drive. */
export async function googleSyncSignIn(): Promise<void> {
  if (!googleConfigured()) throw new Error("Sync isn't set up in this copy of StreamHub (it needs a Google OAuth client ID — see the mobile README)")
  try {
    await signInWith(DRIVE_SCOPE, 'Sync')
  } catch (e) {
    throw signInError(e, 'Sync')
  }
}

/** Turns Sync's Google sign-in off, keeping it if YouTube still uses it. */
export async function googleSyncSignOut(): Promise<void> {
  configure()
  if (googleSignedIn()) return
  await GoogleSignin.revokeAccess().catch(() => null)
  await GoogleSignin.signOut().catch(() => null)
}

export const googleEmail = (): string | undefined => GoogleSignin.getCurrentUser()?.user.email

/** Fetch as the signed-in Google user (Drive for Sync). Throws AuthError when the sign-in is gone. */
export async function googleFetch(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const token = await accessToken()
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(url, { ...init, headers })
    if (res.status === 401 && attempt === 0) {
      await GoogleSignin.clearCachedAccessToken(token).catch(() => null)
      continue
    }
    if (res.status === 401) throw new AuthError('sync: sign-in expired')
    return res
  }
}

export async function googleSignIn(): Promise<void> {
  if (!googleConfigured()) {
    throw new Error("YouTube sign-in isn't set up in this copy of StreamHub (it needs a Google OAuth client ID — see the mobile README → YouTube sign-in)")
  }
  try {
    await signInWith(SCOPE, 'YouTube')
    // Then chat: skipping it still connects YouTube, with chat read-only until signed in from there.
    if (!(await youTubeWebSignedIn().catch(() => false))) await signInToYouTubeWeb().catch(() => undefined)
  } catch (e) {
    throw signInError(e, 'YouTube')
  }
}

const WEB_SIGN_IN =
  'https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=' +
  encodeURIComponent('https://www.youtube.com/signin?action_handle_signin=true&app=m&next=https%3A%2F%2Fm.youtube.com%2F')

/** Whether youtube.com's own pages (chat) are signed in. */
export async function youTubeWebSignedIn(): Promise<boolean> {
  const cookies = await sessionFor('youtube').cookies.get({ url: 'https://www.youtube.com' })
  return cookies.some((c) => c.name === 'LOGIN_INFO' || c.name === 'SAPISID' || c.name === '__Secure-3PAPISID')
}

/** Signs youtube.com's pages in, so chat works as you (rejects if the screen is closed first). */
export function signInToYouTubeWeb(): Promise<void> {
  return loginWindow('youtube', WEB_SIGN_IN, youTubeWebSignedIn, GOOGLE_WEB_UA)
}

export async function googleSignOut(): Promise<void> {
  configure()
  // Sync uses the same Google sign-in; keep it while Sync is on.
  if (!store.get('syncEnabled')) {
    await GoogleSignin.revokeAccess().catch(() => null)
    await GoogleSignin.signOut().catch(() => null)
  }
  await sessionFor('youtube').clearStorageData().catch(() => undefined)
}

async function accessToken(): Promise<string> {
  configure()
  if (!GoogleSignin.getCurrentUser()) {
    const res = await GoogleSignin.signInSilently().catch(() => null)
    if (!res || res.type !== 'success') throw new AuthError('youtube: sign-in expired')
  }
  return (await GoogleSignin.getTokens()).accessToken
}

/** GET a Google API URL as the signed-in user. Throws AuthError when the sign-in is gone. */
export async function googleGet<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const token = await accessToken()
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    if (res.status === 401 && attempt === 0) {
      // Expired early or revoked; drop the cached token and try once more.
      await GoogleSignin.clearCachedAccessToken(token).catch(() => null)
      continue
    }
    if (res.status === 401) throw new AuthError('youtube: sign-in expired')
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      throw new Error(`youtube: ${body?.error?.message ?? `HTTP ${res.status}`}`)
    }
    return (await res.json()) as T
  }
}
