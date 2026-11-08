import { memo } from 'react'
import type { Channel, LiveInfo, Platform } from '@shared/types'
import { formatViewers } from '../store'
import { ChannelAvatar } from './ChannelAvatar'
import { CombinedPlatformDots, PlatformOverlayBadge } from './platform'

/** Avatar with platform badge, name and category/viewer count — the sidebar and Channels list row. */
function ChannelRowImpl({
  channel,
  live,
  compact = false,
  combinedPlatforms
}: {
  channel: Channel
  live?: LiveInfo
  compact?: boolean
  /** Set for a combined group: one dot per platform instead of the single platform badge. */
  combinedPlatforms?: Platform[]
}): React.JSX.Element {
  const isLive = Boolean(live)
  return (
    <div className={`flex w-full items-center gap-2.5 ${!isLive && !compact ? 'opacity-60' : ''}`}>
      <div className="relative shrink-0">
        <ChannelAvatar src={channel.avatarUrl} name={channel.displayName} className="size-9 rounded-full bg-control object-cover" />
        {combinedPlatforms ? <CombinedPlatformDots platforms={combinedPlatforms} /> : <PlatformOverlayBadge platform={channel.platform} />}
        {isLive && !compact && (
          <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-support-red ring-2 ring-background" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-regular text-primary">{channel.displayName}</span>
        {live?.category && <span className="truncate text-small text-tertiary">{live.category}</span>}
        {!live && compact && <span className="truncate text-small text-tertiary">Offline</span>}
        {live && compact && !live.category && <span className="truncate text-small text-support-red">Live</span>}
      </div>
      {live?.viewers !== undefined && (
        <span className="shrink-0 text-small text-tertiary tabular-nums">{formatViewers(live.viewers)}</span>
      )}
    </div>
  )
}

export const ChannelRow = memo(ChannelRowImpl)
