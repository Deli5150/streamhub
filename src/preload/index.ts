import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { LinuxPad } from '@shared/linuxPads'
import type { Api, AppState, ChannelPageData, ShortcutAction } from '@shared/types'

function subscribe<T>(channel: string, cb: (v: T) => void): () => void {
  const handler = (_: IpcRendererEvent, v: T): void => cb(v)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: Api = {
  getState: () => ipcRenderer.invoke('state'),
  login: (p) => ipcRenderer.invoke('login', p),
  logout: (p) => ipcRenderer.invoke('logout', p),
  refresh: () => ipcRenderer.invoke('refresh'),
  getChannelPage: (key) => ipcRenderer.invoke('channel-page', key),
  loadMore: (key, category, cursor) => ipcRenderer.invoke('load-more', key, category, cursor),
  getAbout: (key) => ipcRenderer.invoke('channel-about', key),
  getTogether: (key) => ipcRenderer.invoke('channel-together', key),
  toggleMute: (key) => ipcRenderer.invoke('toggle-mute', key),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  feedbackInfo: () => ipcRenderer.invoke('feedback-info'),
  getAccentColor: () => ipcRenderer.invoke('accent-color'),
  platform: process.platform,
  updateSettings: (patch) => ipcRenderer.invoke('update-settings', patch),
  setShortcuts: (bindings) => ipcRenderer.invoke('set-shortcuts', bindings),
  openPip: (target) => ipcRenderer.invoke('open-pip', target),
  closePip: () => ipcRenderer.invoke('close-pip'),
  setFullScreen: (on) => ipcRenderer.invoke('set-fullscreen', on),
  playerClosed: () => ipcRenderer.invoke('player-closed'),
  launchBigPicture: () => ipcRenderer.invoke('launch-big-picture'),
  bigPictureOnly: () => ipcRenderer.invoke('big-picture-only'),
  gameMode: () => ipcRenderer.invoke('game-mode'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  phoneSignIn: (target) => ipcRenderer.invoke('google-phone-signin', target),
  cancelPhoneSignIn: () => ipcRenderer.invoke('google-phone-cancel'),
  toggleSaved: (item) => ipcRenderer.invoke('saved-toggle', item),
  removeSaved: (id) => ipcRenderer.invoke('saved-remove', id),
  reorderSaved: (sourceId, targetId) => ipcRenderer.invoke('saved-reorder', sourceId, targetId),
  checkForUpdates: () => ipcRenderer.invoke('update-check'),
  downloadUpdate: () => ipcRenderer.invoke('update-download'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  listYouTubePlaylists: () => ipcRenderer.invoke('yt-playlists-list'),
  importYouTubePlaylists: (ids) => ipcRenderer.invoke('yt-playlists-import', ids),
  refreshYouTubePlaylist: (id) => ipcRenderer.invoke('yt-playlists-refresh', id),
  removeYouTubePlaylist: (id) => ipcRenderer.invoke('yt-playlists-remove', id),
  getChapters: (platform, mediaId) => ipcRenderer.invoke('video-chapters', platform, mediaId),
  syncSignIn: () => ipcRenderer.invoke('sync-sign-in'),
  syncSignOut: () => ipcRenderer.invoke('sync-sign-out'),
  syncNow: () => ipcRenderer.invoke('sync-now'),
  pickFromMenubar: (key) => ipcRenderer.invoke('menubar-pick', key),
  hideMenubar: () => ipcRenderer.invoke('menubar-hide'),
  onState: (cb) => subscribe<AppState>('state', cb),
  onOpenChannel: (cb) => subscribe<string>('open-channel', cb),
  onShortcut: (cb) => subscribe<ShortcutAction>('shortcut', cb),
  onPipState: (cb) => subscribe<string | null>('pip-state', cb),
  onLinuxPads: (cb) => subscribe<LinuxPad[]>('linux-pad', cb),
  onChannelPage: (cb) => {
    const handler = (_: IpcRendererEvent, key: string, data: ChannelPageData): void => cb(key, data)
    ipcRenderer.on('channel-page', handler)
    return () => ipcRenderer.removeListener('channel-page', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
