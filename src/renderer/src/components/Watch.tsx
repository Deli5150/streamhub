import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpIcon,
  BellIcon,
  BellOffIcon,
  ClockIcon,
  ExternalLinkIcon,
  LayoutGridIcon,
  MessageSquareIcon,
  MessageSquareOffIcon,
  PictureInPicture2Icon,
  RadioIcon,
  RectangleHorizontalIcon,
  UsersIcon,
  XIcon
} from 'lucide-react'
import type { Channel, ChatTarget, LiveInfo } from '@shared/types'
import { channelPageUrl, chatUrl, embedUrl } from '@shared/urls'
import { formatViewers, uptime, useChannel, useTheaterEsc, useUi } from '../store'
import { ChannelAvatar } from './ChannelAvatar'
import { groupOf } from '../lib/combined'
import { openPipFor } from './channelMenu'
import { PLATFORM_META, PlatformOverlayBadge } from './platform'
import { AboutSection } from './AboutSection'
import { StreamTogether } from './StreamTogether'
import { ChannelPage } from './ChannelPage'
import { savedLive } from '../lib/watchLater'
import { SaveForLaterButton } from './SaveForLater'
import { Button, EmptyState } from './ui'
import { WebView, type PageHandle } from './WebView'
import { CHAT_INPUT_HIDDEN_CSS, ChatBox } from './ChatBox'

export function Watch({ channelKey, offline }: { channelKey: string; offline?: boolean }): React.JSX.Element {
  const { channel, live } = useChannel(channelKey)
  if (!channel) return <EmptyState icon={<RadioIcon className="size-8 text-tertiary" />} title="Channel not found" />
  if (!live || offline) return <ChannelPage channel={channel} live={live} />
  return <LivePlayer channel={channel} live={live} />
}

/** Live members of the watched channel's combined group (watched channel first), else just it. */
function useLiveMembers(channel: Channel): Channel[] {
  const app = useUi((s) => s.app)
  const group = app ? groupOf(app.settings.combined, channel.key) : undefined
  if (!app || !group) return [channel]
  const byKey = new Map(app.channels.map((c) => [c.key, c]))
  const members = group.memberKeys.map((k) => byKey.get(k)).filter((c): c is Channel => Boolean(c && app.live[c.key]))
  return [channel, ...members.filter((c) => c.key !== channel.key)]
}

function LivePlayer({ channel, live }: { channel: Channel; live: LiveInfo }): React.JSX.Element {
  const app = useUi((s) => s.app)
  const [chatOpen, setChatOpen] = useState(true)
  // Theater mode hides the sidebar (App.tsx) and chat; it stays on from stream to stream until turned off.
  const theater = useUi((s) => s.theater)
  const setTheater = (on: boolean): void => useUi.getState().set({ theater: on })
  const showChat = chatOpen && !theater
  useTheaterEsc(theater)
  // Combined channels: switch which member's stream plays and whose chat shows (independently).
  const members = useLiveMembers(channel)
  const [videoKey, setVideoKey] = useState(channel.key)
  const [chatKey, setChatKey] = useState(channel.key)
  useEffect(() => {
    setVideoKey(channel.key)
    setChatKey(channel.key)
    // Opening a stream minimizes the sidebar to its avatar rail for a bigger player.
    useUi.getState().set({ collapsed: true })
  }, [channel.key])
  const videoChannel = members.find((c) => c.key === videoKey) ?? channel
  const chatChannel = members.find((c) => c.key === chatKey) ?? channel
  const videoLive = app?.live[videoChannel.key] ?? live
  const player = embedUrl(videoChannel, videoLive)
  const [aboutOpen, setAboutOpen] = useState(false)
  useEffect(() => setAboutOpen(false), [videoChannel.key])
  const scrollRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  // Reading the About section scrolls the player away; once it's mostly out of view it floats as a
  // mini player in the corner. It's the same element restyled, so the stream doesn't reload.
  const [playerOut, setPlayerOut] = useState(false)
  useEffect(() => {
    const slot = slotRef.current
    if (!slot) return
    const observer = new IntersectionObserver(([e]) => setPlayerOut(e.intersectionRatio < 0.5), {
      root: scrollRef.current,
      threshold: [0, 0.5, 1]
    })
    observer.observe(slot)
    return () => observer.disconnect()
  }, [])
  const mini = aboutOpen && playerOut && Boolean(player)
  return (
    <div className="flex h-full min-h-0">
      {/* Positioned wrapper outside the scroller, so the mini player stays put while the page scrolls. */}
      <div className="relative flex min-w-0 flex-1">
        <div ref={scrollRef} className="flex min-w-0 flex-1 flex-col overflow-y-auto p-2 pr-0">
          {/* Holds the player's place (and size) while it's floating, so the page doesn't jump. */}
          <div
            ref={slotRef}
            className={`aspect-video w-full shrink-0 rounded-panel ${theater ? 'max-h-[calc(100vh-150px)]' : 'max-h-[calc(100vh-190px)]'} ${mini ? 'bg-well ring-1 ring-separator' : ''}`}
          >
            <div
              className={
                mini
                  ? 'absolute right-4 top-4 z-20 w-[min(360px,45%)] overflow-hidden rounded-card bg-black shadow-2xl ring-1 ring-separator'
                  : 'relative size-full overflow-hidden rounded-panel bg-black ring-1 ring-separator'
              }
            >
              {mini && (
                <div className="flex h-8 items-center gap-1 bg-well pl-3 pr-1">
                  <span className="min-w-0 flex-1 truncate text-small-strong text-secondary">{videoChannel.displayName}</span>
                  <Button variant="plain" onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} title="Back to the stream">
                    <ArrowUpIcon className="size-3.5" />
                  </Button>
                  <Button variant="plain" onClick={() => setAboutOpen(false)} title="Close About">
                    <XIcon className="size-3.5" />
                  </Button>
                </div>
              )}
              {player ? (
                <WebView key={player} platform={videoChannel.platform} src={player} className={mini ? 'aspect-video w-full' : 'size-full'} />
              ) : (
                <div className="grid size-full place-items-center text-tertiary">Stream player unavailable</div>
              )}
            </div>
          </div>
          <ChannelInfo
            channel={videoChannel}
            live={videoLive}
            chatOpen={showChat}
            toggleChat={() => {
              // Showing chat leaves theater mode, which hides it.
              if (theater) {
                setTheater(false)
                setChatOpen(true)
              } else setChatOpen(!chatOpen)
            }}
            theater={theater}
            toggleTheater={() => setTheater(!theater)}
            sourceSwitcher={
              members.length >= 2 ? <MemberSwitcher members={members} activeKey={videoChannel.key} onPick={setVideoKey} label="Stream" /> : undefined
            }
          />
          <StreamTogether channel={videoChannel} title={videoLive.title} />
          <AboutSection channel={videoChannel} streamId={videoLive.streamId} open={aboutOpen} onOpenChange={setAboutOpen} />
        </div>
      </div>
      {showChat && (
        <ChatPanel
          channel={chatChannel}
          src={chatUrl(chatChannel, app?.live[chatChannel.key])}
          switcher={members.length >= 2 ? <MemberSwitcher members={members} activeKey={chatChannel.key} onPick={setChatKey} label="Chat" /> : undefined}
        />
      )}
    </div>
  )
}

/** Platform pills for switching between a combined channel's live members. */
function MemberSwitcher({
  members,
  activeKey,
  onPick,
  label
}: {
  members: Channel[]
  activeKey: string
  onPick(key: string): void
  label: string
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-control-subtle p-0.5 ring-1 ring-separator" role="group" aria-label={`${label} platform`}>
      {members.map((m) => {
        const meta = PLATFORM_META[m.platform]
        const active = m.key === activeKey
        return (
          <button
            key={m.key}
            onClick={() => onPick(m.key)}
            title={`${label}: ${meta.label}`}
            aria-pressed={active}
            className={`flex h-6 items-center gap-1 rounded-md px-2 text-small-strong transition-colors ${
              active ? `${meta.activeBg} text-white shadow-sm` : 'text-secondary hover:text-primary'
            }`}
          >
            <meta.Icon className={`${meta.iconClass === 'size-3.5' ? 'size-3' : 'size-3.5'} shrink-0`} strokeWidth={2.5} />
            {meta.label}
          </button>
        )
      })}
    </div>
  )
}

export function ChatPanel({ channel, src, switcher }: { channel: Channel; src: string | null; switcher?: React.ReactNode }): React.JSX.Element {
  const meta = PLATFORM_META[channel.platform]
  const live = useUi((s) => s.app?.live[channel.key])
  // StreamHub's chat box replaces the platform's own, unless you switch back to it.
  const [ownBox, setOwnBox] = useState(false)
  const page = useRef<PageHandle | null>(null)
  useEffect(() => setOwnBox(false), [channel.key])
  const target: ChatTarget = { platform: channel.platform, channelId: channel.id, streamId: live?.streamId, chatId: live?.chatId, channelName: channel.displayName }
  return (
    <div className="flex w-[340px] shrink-0 flex-col p-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel bg-well ring-1 ring-separator">
        <div className="flex h-9 shrink-0 items-center justify-center gap-1.5 border-b border-separator">
          {switcher ?? (
            <>
              <meta.Icon className={`size-3.5 ${meta.accent}`} strokeWidth={2.5} />
              <span className="text-small-strong text-secondary">Stream chat</span>
            </>
          )}
        </div>
        {src ? (
          <>
            <WebView
              key={`${src}${ownBox ? '#own' : ''}`}
              platform={channel.platform}
              src={src}
              css={ownBox ? undefined : CHAT_INPUT_HIDDEN_CSS}
              pageRef={page}
              className="flex-1"
            />
            {!ownBox && <ChatBox target={target} page={page} onUseOwn={() => setOwnBox(true)} />}
          </>
        ) : (
          <EmptyState icon={<MessageSquareOffIcon className="size-7 text-tertiary" />} title="No chat" description="Chat isn't available for this stream." />
        )}
      </div>
    </div>
  )
}

function ChannelInfo({
  channel,
  live,
  chatOpen,
  toggleChat,
  theater,
  toggleTheater,
  sourceSwitcher
}: {
  channel: Channel
  live: LiveInfo
  chatOpen: boolean
  toggleChat(): void
  theater: boolean
  toggleTheater(): void
  /** Combined channels: picks which platform's stream plays. */
  sourceSwitcher?: React.ReactNode
}): React.JSX.Element {
  const { app, addToMulti, go } = useUi()
  const muted = app?.muted.includes(channel.key)
  return (
    <div className="flex items-start gap-3.5 px-2 py-4">
      <button
        onClick={() => go({ kind: 'watch', key: channel.key, offline: true })}
        title="Past videos"
        className="relative shrink-0 rounded-full ring-2 ring-support-red ring-offset-2 ring-offset-background"
      >
        <ChannelAvatar src={channel.avatarUrl} name={channel.displayName} className="size-14 rounded-full bg-control object-cover" />
        <PlatformOverlayBadge platform={channel.platform} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="text-heading2 text-primary">{channel.displayName}</h1>
        <p className="mt-0.5 line-clamp-2 text-regular text-primary">{live.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-tertiary">
          {live.category && <span className="text-small-strong text-accent">{live.category}</span>}
          <span className="flex items-center gap-1 text-support-red">
            <UsersIcon className="size-3" strokeWidth={2.5} />
            <span className="tabular-nums">{live.viewers !== undefined ? formatViewers(live.viewers) : 'Live'}</span>
          </span>
          {live.startedAt && (
            <span className="flex items-center gap-1 tabular-nums">
              <ClockIcon className="size-3" strokeWidth={2.5} />
              {uptime(live.startedAt)}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {sourceSwitcher}
        <Button onClick={() => addToMulti(channel.key)} title="Add to multi-view">
          <LayoutGridIcon className="size-3.5" strokeWidth={2.25} />
          Multi-view
        </Button>
        <SaveForLaterButton item={savedLive(channel, live)} />
        <Button variant="plain" onClick={() => openPipFor(channel, live)} title="Picture in Picture">
          <PictureInPicture2Icon className="size-3.5" />
        </Button>
        <Button variant="plain" onClick={() => window.api.toggleMute(channel.key)} title={muted ? 'Unmute go-live alerts' : 'Mute go-live alerts'}>
          {muted ? <BellOffIcon className="size-3.5" /> : <BellIcon className="size-3.5" />}
        </Button>
        <Button variant="plain" onClick={toggleChat} title={chatOpen ? 'Hide chat' : 'Show chat'}>
          {chatOpen ? <MessageSquareOffIcon className="size-3.5" /> : <MessageSquareIcon className="size-3.5" />}
        </Button>
        <Button
          variant="plain"
          onClick={toggleTheater}
          title={theater ? 'Exit theater mode (Esc)' : 'Theater mode: hide the sidebar and chat'}
          aria-pressed={theater}
          className={theater ? 'bg-control text-primary' : undefined}
        >
          <RectangleHorizontalIcon className="size-3.5" />
        </Button>
        <Button variant="plain" onClick={() => window.api.openExternal(channelPageUrl(channel))} title={`Open on ${PLATFORM_META[channel.platform].label}`}>
          <ExternalLinkIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
