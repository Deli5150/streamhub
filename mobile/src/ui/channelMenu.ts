import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { PLATFORM_LABEL, type Channel, type Platform } from '@shared/types'
import { channelPageUrl } from '@shared/urls'
import { combinedEdits, groupOf } from '../../../src/renderer/src/lib/combined'
import { actions, useApp } from '../lib/hub'
import { savedLive, savedChannelId } from '../lib/ui'
import { showMenu, type MenuItem } from './Menu'

export const openChannel = (key: string, offline = false): void =>
  router.push({ pathname: '/watch/[key]', params: offline ? { key, offline: '1' } : { key } })

/** Long-press menu for every channel row and card (the desktop's right-click menu). */
export function openChannelMenu(c: Channel): void {
  const app = useApp.getState().app
  if (!app) return
  const live = app.live[c.key]
  const muted = app.muted.includes(c.key)
  const groups = app.settings.combined
  const group = groupOf(groups, c.key)
  const byKey = new Map(app.channels.map((ch) => [ch.key, ch]))
  const saved = app.watchLater.some((i) => i.id === savedChannelId(c.key))

  const combineItems: MenuItem[] = group
    ? [
        { label: 'Add another channel', icon: 'add-circle-outline', onSelect: () => router.push({ pathname: '/combine', params: { seed: c.key, group: group.id } }) },
        ...group.memberKeys.map(
          (k): MenuItem => ({
            label: `Remove ${byKey.get(k)?.displayName ?? k}`,
            sublabel: PLATFORM_LABEL[k.split(':')[0] as Platform],
            icon: 'remove-circle-outline',
            onSelect: () => actions.updateSettings({ combined: combinedEdits.removeMember(groups, group.id, k) })
          })
        ),
        { label: 'Separate all channels', icon: 'git-branch-outline', destructive: true, onSelect: () => actions.updateSettings({ combined: combinedEdits.remove(groups, group.id) }) }
      ]
    : [{ label: 'Combine with another channel', icon: 'people-outline', onSelect: () => router.push({ pathname: '/combine', params: { seed: c.key } }) }]

  showMenu(c.displayName, [
    { label: live ? 'Watch' : 'Open channel', icon: 'play-outline', onSelect: () => openChannel(c.key) },
    { label: 'Past videos', icon: 'film-outline', onSelect: () => openChannel(c.key, true) },
    { label: saved ? 'Remove from Watch Later' : 'Watch Later', icon: saved ? 'bookmark' : 'bookmark-outline', disabled: !live && !saved, onSelect: () => actions.saved.toggle(savedLive(c, live)) },
    'separator',
    ...combineItems,
    'separator',
    { label: muted ? 'Unmute go-live alerts' : 'Mute go-live alerts', icon: muted ? 'notifications-outline' : 'notifications-off-outline', onSelect: () => actions.toggleMute(c.key) },
    { label: `Open on ${PLATFORM_LABEL[c.platform]}`, icon: 'open-outline', onSelect: () => void WebBrowser.openBrowserAsync(channelPageUrl(c)) }
  ])
}
