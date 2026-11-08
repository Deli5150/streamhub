import type { Channel, LiveInfo, Platform } from '@shared/types'
import { formatViewers } from '../store'
import { ChannelAvatar } from './ChannelAvatar'
import { CombinedPlatformDots, PlatformDot } from './platform'
import { Thumbnail } from './Thumbnail'

/**
 * A live channel on Home: a tile with the 16:9 thumbnail (viewer pill, platform dot) and the
 * channel's avatar, name, stream title and category under it. `rank` marks a highlighted channel.
 */
export function LiveChannelCard({
  channel,
  live,
  onSelect,
  onOpenChannel,
  onContextMenu,
  combinedPlatforms,
  rank
}: {
  channel: Channel
  live: LiveInfo
  onSelect(): void
  /** Clicking the avatar opens the channel page (past videos) instead of the stream. */
  onOpenChannel?(): void
  onContextMenu?(e: React.MouseEvent): void
  /** Set for a combined group: one dot per platform, and `live.viewers` is the group total. */
  combinedPlatforms?: Platform[]
  /** Highlighted channels: their place by viewers (1–3). */
  rank?: number
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
      className={`group flex cursor-pointer flex-col gap-2.5 rounded-xl bg-popover/85 p-2 text-left shadow-sm ring-1 backdrop-blur-xl transition-[transform,box-shadow] duration-150 outline-none hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-accent ${
        rank ? 'ring-accent/40' : 'ring-separator'
      }`}
      title={`${channel.displayName}${live.title ? ` — ${live.title}` : ''}`}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-control-subtle">
        <Thumbnail src={live.thumbnail} className="transition-transform duration-300 group-hover:scale-[1.03]" />
        {rank && (
          <span className="absolute top-1.5 right-1.5 flex h-5 items-center rounded-md bg-accent px-1.5 text-small font-semibold text-white shadow">
            #{rank}
          </span>
        )}
        <span className="absolute top-1.5 left-1.5 flex h-5 items-center gap-1 rounded-md bg-black/70 px-1.5 backdrop-blur-sm">
          <span className="size-1.5 rounded-full bg-support-red" aria-hidden="true" />
          <span className="text-small font-semibold text-white tabular-nums">{formatViewers(live.viewers) || 'LIVE'}</span>
        </span>
        <span className="absolute bottom-1.5 left-1.5">
          {combinedPlatforms ? <CombinedPlatformDots platforms={combinedPlatforms} className="relative" /> : <PlatformDot platform={channel.platform} />}
        </span>
      </div>
      <div className="flex min-w-0 items-start gap-2 px-0.5 pb-0.5">
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
          <span className="truncate text-strong text-primary">{channel.displayName}</span>
          {live.title && <span className="line-clamp-1 text-small text-secondary">{live.title}</span>}
          {live.category && <span className="truncate text-small text-tertiary">{live.category}</span>}
        </div>
      </div>
    </div>
  )
}
