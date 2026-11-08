import { Platform as OS } from 'react-native'
import { channelKey, type Channel, type LiveInfo } from '@shared/types'
import {
  extractYtInitialData,
  parseYouTubeLive,
  parseYouTubePlaylistPage,
  parseYouTubePlaylistsPage,
  youTubeSignedOut
} from '../../../src/main/providers/parsers'
import type { Provider } from '../../../src/main/providers/types'
import { youtube as youtubeApi } from '../../../src/main/providers/youtube'
import { signInToYouTubeWeb, youTubeWebSignedIn } from '../desktop/googleAuth'
import { readPage } from '../desktop/hidden'
import { AuthError, sessionFor } from '../desktop/net'
import { youtubeSubscriptions, type ScrapedYouTubeChannel } from '../desktop/pageScripts'
import { store } from '../desktop/store'
import { DESKTOP_UA } from './reader'

// YouTube on Android, signed in on youtube.com in the app like the other platforms. Google's
// Android sign-in library only works once the app is registered in a Google Cloud project (an
// Android OAuth client with the signing key's fingerprint), and otherwise fails with "DEVELOPER
// ERROR". Signing in on the site needs no setup and signs the chat in too. Subscriptions come from
// youtube.com/feed/channels and live status from the subscriptions feed, read the way the desktop app
// read them before it used the YouTube Data API (pageScripts.youtubeSubscriptions,
// parsers.parseYouTubeLive). Channel pages and descriptions are public pages, as on the desktop.

const FEED = 'https://www.youtube.com/feed/subscriptions?hl=en'

/** A signed-in youtube.com page's initial data (the app's requests carry the WebViews' cookies). */
async function signedInPage(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': DESKTOP_UA, 'Accept-Language': 'en-US,en;q=0.9' } })
  if (!res.ok) throw new Error(`youtube: HTTP ${res.status}`)
  const html = await res.text()
  if (youTubeSignedOut(html)) throw new AuthError('youtube: signed out')
  return extractYtInitialData(html)
}

export const youtubeWeb: Provider = {
  ...youtubeApi,
  isConnected: () => Boolean(store.get('usernames').youtube),
  username: () => store.get('usernames').youtube,

  async login() {
    if (!(await youTubeWebSignedIn().catch(() => false))) await signInToYouTubeWeb()
    store.set('usernames', { ...store.get('usernames'), youtube: 'Signed in' })
  },

  async logout() {
    const { youtube: _, ...rest } = store.get('usernames')
    store.set('usernames', rest)
    await sessionFor('youtube').clearStorageData()
  },

  async getFollows() {
    const scraped = await readPage<ScrapedYouTubeChannel[]>(
      'youtube',
      'follows',
      'https://www.youtube.com/feed/channels?hl=en',
      `(${youtubeSubscriptions.toString()})()`,
      120_000
    )
    return scraped.map((c): Channel => ({
      key: channelKey('youtube', c.id),
      platform: 'youtube',
      id: c.id,
      displayName: c.displayName,
      avatarUrl: c.avatarUrl
    }))
  },

  // Playlists from youtube.com/feed/playlists, and each one's page (its first 100 or so videos).
  async getPlaylists() {
    const mine = parseYouTubePlaylistsPage(await signedInPage('https://www.youtube.com/feed/playlists?hl=en'))
    return [{ id: 'LL', title: 'Liked videos' }, ...mine.filter((p) => p.id !== 'LL' && p.id !== 'WL')]
  },

  async getPlaylistVideos(id) {
    return parseYouTubePlaylistPage(await signedInPage(`https://www.youtube.com/playlist?list=${encodeURIComponent(id)}&hl=en`)).items
  },

  async getLive(channels) {
    // The app's own request carries the WebViews' cookies on Android (React Native shares
    // Android's cookie store with them), so it works from the background check too.
    const res = await fetch(FEED, { headers: { 'User-Agent': DESKTOP_UA, 'Accept-Language': 'en-US,en;q=0.9' } })
    if (!res.ok) throw new Error(`youtube: HTTP ${res.status} for the subscriptions feed`)
    const html = await res.text()
    if (youTubeSignedOut(html)) throw new AuthError('youtube: signed out')
    const known = new Set(channels.map((c) => c.key))
    return parseYouTubeLive(extractYtInitialData(html)).flatMap(({ channelId, ...live }): LiveInfo[] => {
      const key = channelKey('youtube', channelId)
      return known.has(key) ? [{ key, ...live }] : []
    })
  }
}

/** Which YouTube sign-in this phone uses: the site on Android, Google's sign-in library on iPhone. */
export const youtubeProvider: Provider = OS.OS === 'android' ? youtubeWeb : youtubeApi
