export const PLATFORMS = ['twitch', 'youtube', 'kick', 'rumble'] as const
export type Platform = (typeof PLATFORMS)[number]

export const PLATFORM_LABEL: Record<Platform, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
  rumble: 'Rumble'
}

export interface Channel {
  /** `${platform}:${id}` — stable across follows refreshes */
  key: string
  platform: Platform
  /** twitch login, YouTube UC… id, kick slug, rumble path ("c/Name" or "user/Name") */
  id: string
  displayName: string
  avatarUrl?: string
}

export interface LiveInfo {
  key: string
  title: string
  viewers?: number
  thumbnail?: string
  category?: string
  startedAt?: string
  /** YouTube video id / Rumble embed id (e.g. "v7f8h0u") */
  streamId?: string
  /** Rumble numeric video id used by the chat popup */
  chatId?: string
  /** Rumble: the stream's video page (where its description is read from) */
  pageUrl?: string
}

export type MediaKind = 'vod' | 'video' | 'clip' | 'short'
export type MediaCategory = 'streams' | 'videos' | 'clips'

/** A past stream, upload, clip or Short shown on a channel page. */
export interface MediaItem {
  /** Platform id: Twitch video id / clip slug, YouTube video id, Kick video uuid / clip id, Rumble numeric id */
  id: string
  kind: MediaKind
  title: string
  thumbnail?: string
  durationText?: string
  viewCountText?: string
  /** Human-readable age ("3 days ago"). */
  publishedText?: string
  /** ISO date (exact or estimated from the age text), used to sort/filter clips. */
  publishedAt?: string
  /** Player page loaded in a webview. */
  playUrl?: string
  /** Direct HLS stream (Kick), played with hls.js. */
  hlsUrl?: string
}

/** A chapter of a video (YouTube). */
export interface VideoChapter {
  title: string
  /** Start, in seconds. */
  start: number
  thumbnail?: string
}

/** Everything on a channel's page: past streams, uploads and clips/Shorts, each with a paging cursor. */
export interface ChannelPageData {
  /** The channel's own banner (YouTube); other platforms get a brand banner. */
  bannerUrl?: string
  streams: MediaItem[]
  videos: MediaItem[]
  clips: MediaItem[]
  /** Opaque "load more" cursor per category; null when there's nothing further. */
  cursors: Record<MediaCategory, string | null>
  /** Whether the platform separates regular uploads from past streams (YouTube, Rumble). */
  hasVideos: boolean
  /** Short-form tab label, or null when the platform has none (Rumble). */
  clipsLabel: 'Clips' | 'Shorts' | null
}

/** A link or image panel from a channel's About section. */
export interface AboutPanel {
  title?: string
  /** Plain text; may contain bare URLs and markdown-style [text](url) links. */
  text?: string
  imageUrl?: string
  linkUrl?: string
}

/**
 * What's shown under a live stream: the channel's About section (Twitch, Kick) or the stream's own
 * description box (YouTube, Rumble).
 */
export interface ChannelAbout {
  kind: 'about' | 'description'
  /** The bio or description; may contain bare URLs and markdown-style links. */
  text?: string
  /** Social links. */
  links: Array<{ title: string; url: string }>
  panels: AboutPanel[]
}

/** A channel streaming with the one being watched (Twitch shared chat / Stream Together), or @mentioned in its title. */
export interface TogetherChannel {
  platform: Platform
  login: string
  displayName: string
  avatarUrl?: string
  live: boolean
  reason: 'together' | 'mention'
}

/** A Watch Later entry: a live stream (becomes its recording once it ends) or a past video. */
export interface SavedItem {
  /** `channel:<channelKey>` or `vod:<platform>:<media id>` */
  id: string
  kind: 'channel' | 'vod'
  channelKey: string
  platform: Platform
  displayName: string
  avatarUrl?: string
  /** Stream title at save time, or the video's title. */
  title?: string
  thumbnail?: string
  /** Video entries: what to play. */
  media?: MediaItem
  /**
   * Channel entries: the channel's newest past stream while the saved stream was still live, so the
   * stream's own recording can be told apart once it ends. "" = none; undefined = not read yet.
   */
  baselineId?: string
  savedAt: number
}

/** One of the signed-in account's YouTube playlists, as listed in the import picker. */
export interface YouTubePlaylistSummary {
  id: string
  title: string
  thumbnail?: string
  /** Number of videos, when YouTube says. */
  count?: number
}

/** A YouTube playlist imported in Settings: shown on Home and played like Watch Later (read-only). */
export interface ImportedPlaylist {
  id: string
  title: string
  thumbnail?: string
  /** Its videos, in the playlist's order ('vod' entries). */
  items: SavedItem[]
  importedAt: number
  /** When its videos were last read from YouTube. */
  refreshedAt: number
}

export interface AccountInfo {
  platform: Platform
  connected: boolean
  username?: string
  error?: string
}

/** One streamer's channels across platforms, shown as a single sidebar profile. */
export interface CombinedGroup {
  id: string
  /** Member shown in the sidebar (avatar + name). */
  mainKey: string
  /** Member opened to watch when the profile is clicked. */
  defaultKey: string
  memberKeys: string[]
}

export const SHORTCUT_ACTIONS = ['toggleSidebar', 'toggleChannels', 'multiView', 'pip', 'returnHome', 'toggleMenubarApp'] as const
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number]

export const MENUBAR_THEMES = ['default', 'operagx', 'gummy', 'terminal', 'shortcuts'] as const
export type MenubarTheme = (typeof MENUBAR_THEMES)[number]

export interface Settings {
  /** Colorway id ("default" follows the system appearance). */
  theme: string
  menubar: {
    enabled: boolean
    /** Open picked channels on the platform's website instead of in StreamHub. */
    openInBrowser: boolean
    theme: MenubarTheme
  }
  /** Desktop notification when a followed channel goes live. */
  notifyLive: boolean
  /** Skip the ads Twitch stitches into streams (see main/twitchAds.ts). */
  blockTwitchAds: boolean
  /** Move the playing video to picture-in-picture when the window is minimized or hidden. */
  pipOnMinimize: boolean
  /** Desktop: open straight into Big Picture mode when the app starts. */
  bigPictureOnStartup: boolean
  /** Look for a new version on launch and every few hours (main/updater.ts). */
  checkUpdates: boolean
  /** Accelerator overrides, any number per action, e.g. { toggleSidebar: ["Control+Command+S", "F5"] }. */
  shortcuts: Partial<Record<ShortcutAction, string[]>>
  combined: CombinedGroup[]
}

/** Sync with Google (main/sync.ts). */
export interface SyncStatus {
  signedIn: boolean
  /** The Google account syncing. */
  email?: string
  lastSync?: number
  syncing: boolean
  error?: string
}

/** The in-app updater (main/updater.ts). */
export interface UpdateStatus {
  /** This version. */
  current: string
  state: 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'ready' | 'installing' | 'error'
  /** The newer version, once found. */
  version?: string
  notes?: string
  /** Its release page. */
  page?: string
  /** 0–1 while downloading. */
  progress?: number
  error?: string
  /**
   * Whether this install can update itself in place; otherwise the update button opens the release
   * page (a development build, or a Linux install StreamHub can't find).
   */
  inApp: boolean
  /** Steam's Game Mode: installing closes StreamHub (start it again from the library) rather than restarting. */
  closesToInstall?: boolean
  lastCheck?: number
}

/** A Google sign-in waiting to be approved on a phone: enter `code` at `url` (google.com/device). */
export interface PhoneSignIn {
  target: 'sync' | 'youtube'
  code: string
  url: string
  expiresAt: number
}

export interface AppState {
  channels: Channel[]
  live: Record<string, LiveInfo>
  accounts: AccountInfo[]
  muted: string[]
  syncing: Platform[]
  settings: Settings
  shortcutDefaults: Record<ShortcutAction, string[]>
  /** Watch Later playlist, in the user's order. */
  watchLater: SavedItem[]
  /** Imported YouTube playlists, in import order. */
  ytPlaylists: ImportedPlaylist[]
  sync: SyncStatus
  update: UpdateStatus
  phoneSignIn: PhoneSignIn | null
}

export const channelKey = (platform: Platform, id: string): string => `${platform}:${id}`

export interface Api {
  getState(): Promise<AppState>
  login(p: Platform): Promise<void>
  logout(p: Platform): Promise<void>
  refresh(): Promise<void>
  getChannelPage(key: string): Promise<ChannelPageData>
  loadMore(key: string, category: MediaCategory, cursor: string): Promise<{ items: MediaItem[]; cursor: string | null }>
  /** The live channel's About section or stream description (see ChannelAbout). */
  getAbout(key: string): Promise<ChannelAbout>
  /** Channels the live channel is streaming with, or mentions in its title (Twitch). */
  getTogether(key: string): Promise<TogetherChannel[]>
  toggleMute(key: string): Promise<void>
  openExternal(url: string): Promise<void>
  /** For the Feedback button: the app's version, whether this is the Steam copy, and the recent log (safe to post). */
  feedbackInfo(): Promise<{ version: string; steam: boolean; log: string }>
  /** macOS/Windows system accent as #rrggbb, or null where unavailable */
  getAccentColor(): Promise<string | null>
  platform: string
  /** Merges a partial settings object (top-level keys replace, `menubar` merges). */
  updateSettings(patch: Partial<Omit<Settings, 'menubar'>> & { menubar?: Partial<Settings['menubar']> }): Promise<void>
  /** Validates and saves a shortcut; rebuilds the app menu and global shortcut. */
  setShortcuts(bindings: Partial<Record<ShortcutAction, string[]>>): Promise<{ success: boolean; error?: string }>
  /**
   * Plays a player URL (or, with `hls`, a direct HLS stream) in the native picture-in-picture window,
   * optionally starting at `startAt` seconds. Resolves false if it couldn't start.
   */
  /** Big Picture mode: full screen on or off for the window. */
  setFullScreen(on: boolean): Promise<void>
  /** A video player is being removed: the window leaves any fullscreen it had (see main/fullscreen.ts). */
  playerClosed(): Promise<void>
  /** Whether this launch should open in Big Picture (`--big-picture`, or Steam's Game Mode). */
  launchBigPicture(): Promise<boolean>
  /** The Steam copy: Big Picture is the whole app (no way out to the usual window). */
  bigPictureOnly(): Promise<boolean>
  quitApp(): Promise<void>
  /**
   * Signs in to Google (Sync, or YouTube) on a phone: the code to enter shows up in the state
   * (phoneSignIn) and this resolves once it's approved. Rejects if cancelled or it fails.
   */
  phoneSignIn(target: 'sync' | 'youtube'): Promise<void>
  cancelPhoneSignIn(): Promise<void>
  /** `live`: a live stream (no seeking controls). */
  openPip(target: { platform: Platform; url: string; hls?: boolean; startAt?: number; live?: boolean }): Promise<boolean>
  /** Closes the PiP window (the in-app player resumes). */
  closePip(): Promise<void>
  /** Adds the item to Watch Later, or removes it if it's already there. */
  toggleSaved(item: Omit<SavedItem, 'savedAt'>): Promise<void>
  removeSaved(id: string): Promise<void>
  /** Moves `sourceId` to `targetId`'s position. */
  reorderSaved(sourceId: string, targetId: string): Promise<void>
  /** A YouTube video's chapters (empty when it has none). */
  getChapters(platform: Platform, mediaId: string): Promise<VideoChapter[]>
  /** The YouTube account's playlists, for the import picker (needs YouTube connected). */
  listYouTubePlaylists(): Promise<YouTubePlaylistSummary[]>
  /** Imports these playlists (with their videos); already imported ones are refreshed. */
  importYouTubePlaylists(ids: string[]): Promise<void>
  /** Re-reads an imported playlist's videos from YouTube (all of them without an id). */
  refreshYouTubePlaylist(id?: string): Promise<void>
  removeYouTubePlaylist(id: string): Promise<void>
  /** Updater: look for a new version now, download it, then install it and restart. */
  checkForUpdates(): Promise<void>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>
  /** Sync with Google: sign in (opens the browser), sign out, sync now. */
  syncSignIn(): Promise<void>
  syncSignOut(): Promise<void>
  syncNow(): Promise<void>
  /** Menu-bar popup: open a channel (in StreamHub or the browser, per settings) and close the popup. */
  pickFromMenubar(key: string): Promise<void>
  hideMenubar(): Promise<void>
  onState(cb: (s: AppState) => void): () => void
  onOpenChannel(cb: (key: string) => void): () => void
  onShortcut(cb: (action: ShortcutAction) => void): () => void
  /** Player URL currently in picture-in-picture, or null when PiP closes. */
  onPipState(cb: (url: string | null) => void): () => void
  /** A channel page was (re)loaded from the site; pushes its fresh data. */
  onChannelPage(cb: (key: string, data: ChannelPageData) => void): () => void
}
