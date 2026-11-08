import { useEffect, useState } from 'react'
import { ExternalLinkIcon, UsersIcon } from 'lucide-react'
import { channelKey, type Channel, type TogetherChannel } from '@shared/types'
import { useUi } from '../store'
import { ChannelAvatar } from './ChannelAvatar'

/**
 * Under a live stream: the channels it's streaming with (Twitch shared chat / Stream Together) and
 * the channels its title @mentions. Followed channels open in the app; others open on Twitch.
 */
export function StreamTogether({ channel, title }: { channel: Channel; title: string }): React.JSX.Element | null {
  const [found, setFound] = useState<TogetherChannel[]>([])
  useEffect(() => {
    let cancelled = false
    setFound([])
    if (channel.platform !== 'twitch') return
    window.api.getTogether(channel.key).then(
      (list) => !cancelled && setFound(list),
      () => {}
    )
    return () => {
      cancelled = true
    }
  }, [channel.key, channel.platform, title])

  const together = found.filter((c) => c.reason === 'together')
  const mentioned = found.filter((c) => c.reason === 'mention')
  if (!found.length) return null
  return (
    <div className="mx-2 mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 px-2">
      {together.length > 0 && <Group label="Streaming together" icon channels={together} />}
      {mentioned.length > 0 && <Group label="Mentioned" channels={mentioned} />}
    </div>
  )
}

function Group({ label, icon, channels }: { label: string; icon?: boolean; channels: TogetherChannel[] }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1 text-small-strong text-secondary">
        {icon && <UsersIcon className="size-3.5" strokeWidth={2.25} />}
        {label}
      </span>
      {channels.map((c) => (
        <Chip key={c.login} channel={c} />
      ))}
    </div>
  )
}

function Chip({ channel: c }: { channel: TogetherChannel }): React.JSX.Element {
  const { app, go } = useUi()
  const key = channelKey(c.platform, c.login)
  const followed = Boolean(app?.channels.some((ch) => ch.key === key))
  const open = (): void => {
    if (followed) go({ kind: 'watch', key })
    else window.api.openExternal(`https://www.twitch.tv/${c.login}`)
  }
  return (
    <button
      type="button"
      onClick={open}
      title={`${followed ? 'Watch' : 'Open on Twitch:'} ${c.displayName}${c.live ? ' (live)' : ' (offline)'}`}
      className="flex h-8 items-center gap-1.5 rounded-pill bg-control-subtle py-1 pr-3 pl-1 ring-1 ring-separator transition-colors hover:bg-control"
    >
      <span className={`relative shrink-0 rounded-full ${c.live ? 'ring-2 ring-support-red' : ''}`}>
        <ChannelAvatar src={c.avatarUrl} name={c.displayName} className="size-6 rounded-full bg-control object-cover" />
      </span>
      <span className="text-small-strong text-primary">{c.displayName}</span>
      {c.live && <span className="text-small-strong text-support-red">Live</span>}
      {!followed && <ExternalLinkIcon className="size-3 text-tertiary" strokeWidth={2.5} />}
    </button>
  )
}
