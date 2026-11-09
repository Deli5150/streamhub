import { BrowserWindow } from 'electron'
import type { Channel, ChannelAbout, ChannelPageData, TogetherChannel, LiveInfo, MediaCategory, MediaItem, Platform, SavedItem, YouTubePlaylistSummary } from '@shared/types'
import { partition } from '../net'

export interface Provider {
  platform: Platform
  /** How often live status should be refreshed (YouTube is slower to protect API quota). */
  liveIntervalMs: number
  isConnected(): boolean
  username(): string | undefined
  login(): Promise<void>
  logout(): Promise<void>
  getFollows(): Promise<Channel[]>
  /** Returns only the channels that are currently live. */
  getLive(channels: Channel[]): Promise<LiveInfo[]>
  /**
   * Live status without being signed in to the platform, from its public pages: used for members of
   * combined channels on a platform this computer isn't signed in to (follows can come over by sync
   * without the sign-in), so the stream and chat switchers still find them live.
   */
  getLiveSignedOut?(channels: Channel[]): Promise<LiveInfo[]>
  /** Whether the last getLive answered without some details (YouTube's viewer counts) that a check moments later will have. */
  liveIsPartial?(): boolean
  /** `background`: a preload nobody is waiting on (kept off the readers used for on-demand loads). */
  getChannelPage(ch: Channel, opts?: { background?: boolean }): Promise<ChannelPageData>
  /** Next batch for one category, from a cursor the page (or a previous call) returned. */
  loadMore(ch: Channel, category: MediaCategory, cursor: string): Promise<{ items: MediaItem[]; cursor: string | null }>
  /** The channel's About section (Twitch, Kick) or the live stream's description (YouTube, Rumble). */
  getAbout(ch: Channel, live?: LiveInfo): Promise<ChannelAbout>
  /** Channels streaming with this one, or mentioned in its title (Twitch only). */
  getTogether?(ch: Channel, live?: LiveInfo): Promise<TogetherChannel[]>
  /** YouTube: the signed-in account's playlists (Liked videos first). */
  getPlaylists?(): Promise<YouTubePlaylistSummary[]>
  /** YouTube: a playlist's playable videos, in order, as Watch Later-style entries. */
  getPlaylistVideos?(id: string): Promise<Array<Omit<SavedItem, 'savedAt'>>>
}

/**
 * Opens a sign-in window on the platform's partition. `check` runs after every navigation and on a
 * timer; the window closes as soon as it resolves true. Rejects if the user closes it first.
 */
export function loginWindow(
  p: Platform,
  url: string,
  check: () => Promise<boolean>,
  userAgent?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 520,
      height: 760,
      title: `Sign in to ${p}`,
      autoHideMenuBar: true,
      webPreferences: { partition: partition(p) }
    })
    let done = false
    const finish = (ok: boolean, err?: Error): void => {
      if (done) return
      done = true
      clearInterval(timer)
      if (!win.isDestroyed()) win.close()
      ok ? resolve() : reject(err ?? new Error('Sign-in window closed'))
    }
    const run = (): void => {
      check().then((ok) => ok && finish(true), () => {})
    }
    const timer = setInterval(run, 1500)
    win.webContents.on('did-navigate', run)
    win.webContents.on('did-navigate-in-page', run)
    win.on('closed', () => {
      // Give one last check a chance — some sites set cookies right before the user closes.
      if (done) return
      check()
        .catch(() => false)
        .then((ok) => finish(ok))
    })
    if (userAgent) win.webContents.setUserAgent(userAgent)
    win.loadURL(url)
  })
}
