import {
  BellIcon,
  BellOffIcon,
  ExternalLinkIcon,
  LayoutGridIcon,
  MinusIcon,
  PictureInPicture2Icon,
  PlayIcon,
  PlusIcon,
  SplitIcon,
  UsersIcon,
  VideoIcon
} from 'lucide-react'
import type { Channel } from '@shared/types'
import { channelPageUrl, embedUrl } from '@shared/urls'
import { combinedEdits, groupOf } from '../lib/combined'
import { useUi } from '../store'
import { PLATFORM_META } from './platform'
import { useContextMenu, type MenuItem } from './ui'

/**
 * Plays a live channel in the native picture-in-picture window. In-app players showing the same
 * stream gray out and go silent while it's open (see WebView).
 */
export function openPipFor(channel: Channel, live = useUi.getState().app?.live[channel.key]): void {
  const url = live && embedUrl(channel, live)
  if (url) void window.api.openPip({ platform: channel.platform, url, live: true })
}

/** Right-click menu shared by every channel row and card, including combined-channel management. */
export function useChannelMenu(): { openFor(e: React.MouseEvent, channel: Channel): void; element: React.ReactNode } {
  const { app, go, addToMulti, set } = useUi()
  const menu = useContextMenu()
  return {
    element: menu.element,
    openFor: (e, c) => {
      const live = Boolean(app?.live[c.key])
      const muted = app?.muted.includes(c.key)
      const groups = app?.settings.combined ?? []
      const group = groupOf(groups, c.key)
      const byKey = new Map((app?.channels ?? []).map((ch) => [ch.key, ch]))

      const combineItems: Array<MenuItem | 'separator'> = group
        ? [
            { label: 'Add another channel', icon: <PlusIcon className="size-3.5" />, onSelect: () => set({ combine: { group, seedKey: c.key } }) },
            ...group.memberKeys.map(
              (k): MenuItem => ({
                label: `Remove ${byKey.get(k)?.displayName ?? k}`,
                sublabel: PLATFORM_META[k.split(':')[0] as Channel['platform']].label,
                icon: <MinusIcon className="size-3.5" />,
                onSelect: () => window.api.updateSettings({ combined: combinedEdits.removeMember(groups, group.id, k) })
              })
            ),
            {
              label: 'Separate all channels',
              icon: <SplitIcon className="size-3.5" />,
              destructive: true,
              onSelect: () => window.api.updateSettings({ combined: combinedEdits.remove(groups, group.id) })
            }
          ]
        : [{ label: 'Combine with another channel', icon: <UsersIcon className="size-3.5" />, onSelect: () => set({ combine: { group: null, seedKey: c.key } }) }]

      menu.open(e, [
        { label: live ? 'Watch' : 'Open channel', icon: <PlayIcon className="size-3.5" />, onSelect: () => go({ kind: 'watch', key: c.key }) },
        { label: 'Past videos', icon: <VideoIcon className="size-3.5" />, onSelect: () => go({ kind: 'watch', key: c.key, offline: true }) },
        { label: 'Add to multi-view', icon: <LayoutGridIcon className="size-3.5" />, onSelect: () => addToMulti(c.key), disabled: !live },
        { label: 'Picture in Picture', icon: <PictureInPicture2Icon className="size-3.5" />, onSelect: () => openPipFor(c), disabled: !live },
        'separator',
        ...combineItems,
        'separator',
        {
          label: muted ? 'Unmute go-live alerts' : 'Mute go-live alerts',
          icon: muted ? <BellIcon className="size-3.5" /> : <BellOffIcon className="size-3.5" />,
          onSelect: () => window.api.toggleMute(c.key)
        },
        {
          label: `Open on ${PLATFORM_META[c.platform].label}`,
          icon: <ExternalLinkIcon className="size-3.5" />,
          onSelect: () => window.api.openExternal(channelPageUrl(c))
        }
      ])
    }
  }
}
