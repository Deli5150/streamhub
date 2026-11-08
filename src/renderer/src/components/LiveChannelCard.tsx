import type { Channel, LiveInfo, Platform } from '@shared/types'
import { formatViewers } from '../store'
import { ChannelAvatar } from './ChannelAvatar'
import { CombinedPlatformDots, PlatformDot } from './platform'
import { Thumbnail } from './Thumbnail'

/** Twitch-"Following"-style card: 16:9 thumbnail with viewer pill + platform dot, then avatar and text. */
export function LiveChannelCard({
  channel,
  live,
  onSelect,
  onOpenChannel,
  onContextMenu,
  combinedPlatforms
}: {
  channel: Channel
  live: LiveInfo
  onSelect(): void
  /** Clicking the avatar opens the channel page (past videos) instead of the stream. */
  onOpenChannel?(): void
  onContextMenu?(e: React.MouseEvent): void
  /** Set for a combined group: one dot per platform, and `live.viewers` is the group total. */
  combinedPlatforms?: Platform[]
}): React.JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className="group flex flex-col gap-2 text-left outline-none"
      title={`${channel.displayName}${live.title ? ` — ${live.title}` : ''}`}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-control-subtle ring-1 ring-separator transition-shadow group-hover:ring-secondary">
        <Thumbnail src={live.thumbnail} />
        <span className="absolute top-1.5 left-1.5 flex h-5 items-center gap-1 rounded-md bg-black/70 px-1.5 backdrop-blur-sm">
          <span className="size-1.5 rounded-full bg-support-red" aria-hidden="true" />
          <span className="text-small font-semibold text-white tabular-nums">{formatViewers(live.viewers) || 'LIVE'}</span>
        </span>
        <span className="absolute bottom-1.5 left-1.5">
          {combinedPlatforms ? (
            <CombinedPlatformDots platforms={combinedPlatforms} className="relative" />
          ) : (
            <PlatformDot platform={channel.platform} />
          )}
        </span>
      </div>
      <div className="flex min-w-0 items-start gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenChannel?.()
          }}
          title={`Open ${channel.displayName}'s past videos`}
          className="relative mt-0.5 shrink-0 rounded-full outline-none transition-shadow hover:ring-2 hover:ring-secondary"
        >
          <ChannelAvatar src={channel.avatarUrl} name={channel.displayName} className="block size-8 rounded-full bg-control object-cover" />
        </button>
        <div className="flex min-w-0 flex-col">
          {live.title && <span className="line-clamp-1 text-small-strong text-primary">{live.title}</span>}
          <span className="truncate text-regular text-secondary">{channel.displayName}</span>
          {live.category && <span className="truncate text-regular text-tertiary">{live.category}</span>}
        </div>
      </div>
    </div>
  )
}
