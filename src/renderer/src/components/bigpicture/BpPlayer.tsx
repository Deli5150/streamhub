import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { ArrowLeftIcon, PauseIcon, PlayIcon, QrCodeIcon, RadioIcon, SkipBackIcon, SkipForwardIcon } from 'lucide-react'
import type { Channel, LiveInfo, MediaItem, Platform } from '@shared/types'
import { chatUrl, embedUrl } from '@shared/urls'
import { focusFirst, focusId, useBp, useBpInput, type BpRoute } from '../../lib/bigPicture'
import { groupOf } from '../../lib/combined'
import { progressKey, resumePosition, useVodProgress, withStartTime } from '../../lib/vodProgress'
import { savedTitle } from '../../lib/watchLater'
import { formatViewers, uptime, useUi } from '../../store'
import { ChannelAvatar } from '../ChannelAvatar'
import { clockText } from '../Chapters'
import { HlsVideo } from '../HlsVideo'
import { PLATFORM_META } from '../platform'
import { WebView } from '../WebView'
import { useListItems } from './BpHome'
import { BpButton, Hints, type Hint } from './parts'

// Big Picture's player: the video fills the screen; any input brings up the controls along the
// bottom (and hides them again after a few seconds). Live streams can show chat at the side, and a
// combined channel can switch platforms. Watch Later and the queue move on when a video ends.

const HIDE_AFTER_MS = 4000
/**
 * Chat here is for reading: its message box and buttons are hidden (typing happens on a phone, from
 * the Chat on phone QR code). Twitch (scoped, to outrank its own display: block !important), Kick,
 * YouTube; then any form with a text box (Rumble).
 */
const CHAT_READ_ONLY_CSS = `
  .chat-room__content .chat-input, .chat-room__content [data-test-selector="chat-input-buttons-container"],
  #chatroom-footer,
  #input-panel, yt-live-chat-message-input-renderer,
  form:has(textarea), form:has([contenteditable="true"]) { display: none !important; }
`
const SEEK_STEP = 10

const VIDEO = `[...document.querySelectorAll('video')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]`
const STATE = `(() => { const v = ${VIDEO}; return v ? [v.paused, v.currentTime, v.duration] : null })()`
const TOGGLE = `(() => { const v = ${VIDEO}; if (!v) return; if (v.paused) v.play().catch(() => {}); else v.pause() })()`
const seekBy = (dt: number): string => `(() => { const dt = ${dt}; const yt = document.getElementById('movie_player')
  if (yt && typeof yt.seekTo === 'function') { yt.seekTo(yt.getCurrentTime() + dt, true); return }
  const v = ${VIDEO}; if (v && Number.isFinite(v.duration)) v.currentTime = Math.max(0, Math.min(v.duration - 1, v.currentTime + dt)) })()`

/**
 * A live stream's chat as a page for a phone's browser, where you're signed in and can type: the
 * popout chat (Twitch, Kick, YouTube), or Rumble's stream page, which has its chat.
 */
function phoneChatUrl(ch: Channel, live?: LiveInfo): string | null {
  switch (ch.platform) {
    case 'twitch':
      return `https://www.twitch.tv/popout/${ch.id}/chat`
    case 'youtube':
      return live?.streamId ? `https://www.youtube.com/live_chat?v=${live.streamId}` : null
    case 'kick':
      return `https://kick.com/popout/${ch.id}/chat`
    case 'rumble':
      return live?.pageUrl ?? (live?.chatId ? `https://rumble.com/chat/popup/${live.chatId}` : null)
  }
}

interface WebviewElement extends HTMLElement {
  executeJavaScript(code: string): Promise<unknown>
}

/** What's playing, worked out from the route. */
interface Playing {
  id: string
  platform: Platform
  /** Player page (webview), or a direct HLS stream. */
  src?: string
  hls?: string
  live: boolean
  title: string
  channelName: string
  avatarUrl?: string
  /** Videos: where progress is saved, and where to resume. */
  progressKey?: string
  chat?: { channel: Channel; src: string }
  /** Live: why it can't play, if it can't. */
  unavailable?: string
}

function liveMembers(channel: Channel, app: NonNullable<ReturnType<typeof useUi.getState>['app']>): Channel[] {
  const group = groupOf(app.settings.combined, channel.key)
  if (!group) return [channel]
  const live = group.memberKeys.map((k) => app.channels.find((c) => c.key === k)).filter((c): c is Channel => Boolean(c && app.live[c.key]))
  return [channel, ...live.filter((c) => c.key !== channel.key)]
}

function vodPlaying(id: string, platform: Platform, media: MediaItem, channelName: string, avatarUrl?: string): Playing {
  return {
    id,
    platform,
    src: media.playUrl,
    hls: media.playUrl ? undefined : media.hlsUrl,
    live: false,
    title: media.title,
    channelName,
    avatarUrl,
    progressKey: progressKey(platform, media.id),
    unavailable: media.playUrl || media.hlsUrl ? undefined : "This video can't be played here."
  }
}

export function BpPlayer({ route }: { route: Extract<BpRoute, { kind: 'live' | 'vod' | 'list' }> }): React.JSX.Element {
  const app = useUi((s) => s.app)
  const pop = useBp((s) => s.pop)
  const items = useListItems(route.kind === 'list' ? route.source : 'watchLater')
  const [index, setIndex] = useState(route.kind === 'list' ? route.index : 0)
  // Live (and a live list item): which combined member's stream plays.
  const [sourceKey, setSourceKey] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)

  // ---------- What's playing ----------
  const item = route.kind === 'list' ? items[Math.min(index, items.length - 1)] : undefined
  const liveKey = route.kind === 'live' ? route.key : item?.kind === 'channel' ? item.channelKey : null
  const liveChannel = liveKey ? app?.channels.find((c) => c.key === liveKey) : undefined
  const members = liveChannel && app ? liveMembers(liveChannel, app) : []
  let playing: Playing | null = null
  if (route.kind === 'vod') {
    const ch = app?.channels.find((c) => c.key === route.key)
    playing = vodPlaying(`vod:${route.media.id}`, ch?.platform ?? (route.key.split(':')[0] as Platform), route.media, ch?.displayName ?? '', ch?.avatarUrl)
  } else if (item?.kind === 'vod' && item.media) {
    playing = vodPlaying(item.id, item.platform, item.media, item.displayName, item.avatarUrl)
  } else if (liveKey) {
    const ch = members.find((m) => m.key === sourceKey) ?? liveChannel
    const live = ch && app?.live[ch.key]
    const src = ch && live ? embedUrl(ch, live) : null
    const chat = ch && live ? chatUrl(ch, live) : null
    playing = {
      id: `live:${ch?.key ?? liveKey}`,
      platform: ch?.platform ?? (liveKey.split(':')[0] as Platform),
      src: src ?? undefined,
      live: true,
      title: live?.title || (item ? savedTitle(item) : ''),
      channelName: ch?.displayName ?? item?.displayName ?? '',
      avatarUrl: ch?.avatarUrl ?? item?.avatarUrl,
      chat: ch && chat ? { channel: ch, src: chat } : undefined,
      unavailable: src ? undefined : `${ch?.displayName ?? item?.displayName ?? 'This channel'} isn't live right now.`
    }
  }
  const liveInfo = playing?.live && app ? app.live[playing.id.replace(/^live:/, '')] : undefined

  // ---------- Resume and progress ----------
  const save = useVodProgress((s) => s.save)
  const [startAt, setStartAt] = useState(() => (playing?.progressKey ? resumePosition(playing.progressKey) : 0))
  const playingId = playing?.id
  const progressKeyRef = useRef(playing?.progressKey)
  progressKeyRef.current = playing?.progressKey
  useEffect(() => {
    setStartAt(progressKeyRef.current ? resumePosition(progressKeyRef.current) : 0)
    setSourceKey(null)
  }, [playingId])
  const onProgress = useCallback(
    (t: number, d: number) => {
      if (progressKeyRef.current) save(progressKeyRef.current, t, d)
    },
    [save]
  )
  const canPrev = route.kind === 'list' && index > 0
  const canNext = route.kind === 'list' && index < items.length - 1
  const step = (by: number): void => setIndex((i) => Math.max(0, Math.min(items.length - 1, i + by)))
  const onEnded = useCallback(() => {
    if (route.kind === 'list') setIndex((i) => (i < items.length - 1 ? i + 1 : i))
  }, [route.kind, items.length])

  // ---------- Talking to the video ----------
  const boxRef = useRef<HTMLDivElement>(null)
  const run = useCallback(async (code: string, direct: (v: HTMLVideoElement) => unknown): Promise<unknown> => {
    const box = boxRef.current
    const view = box?.querySelector<WebviewElement>('webview')
    if (view) return view.executeJavaScript(code).catch(() => null)
    const video = box?.querySelector('video')
    return video ? direct(video) : null
  }, [])
  const toggle = (): void =>
    void run(TOGGLE, (v) => (v.paused ? v.play().catch(() => {}) : v.pause())).then(() => setTimeout(() => void poll(), 150))
  const seek = (dt: number): void => {
    if (!playing || playing.live) return
    void run(seekBy(dt), (v) => {
      v.currentTime = Math.max(0, Math.min(v.duration - 1, v.currentTime + dt))
    }).then(() => setTimeout(() => void poll(), 150))
  }
  const [state, setState] = useState<{ paused: boolean; t: number; d: number } | null>(null)
  const poll = useCallback(async () => {
    const r = (await run(STATE, (v) => [v.paused, v.currentTime, v.duration])) as [boolean, number, number] | null
    setState(r ? { paused: r[0], t: r[1], d: r[2] } : null)
  }, [run])
  useEffect(() => {
    setState(null)
    const timer = setInterval(() => void poll(), 1000)
    return () => clearInterval(timer)
  }, [poll, playingId])

  // ---------- Controls overlay ----------
  const [shown, setShown] = useState(true)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const paused = state?.paused ?? false
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const show = useCallback(() => {
    setShown(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (!pausedRef.current) setShown(false)
    }, HIDE_AFTER_MS)
  }, [])
  useEffect(() => {
    show()
    return () => clearTimeout(hideTimer.current)
  }, [show, playingId])
  useEffect(() => {
    if (shown) requestAnimationFrame(() => focusFirst())
  }, [shown])

  const chatAvailable = Boolean(playing?.chat)
  const [qrOpen, setQrOpen] = useState(false)
  const phoneUrl = playing?.chat && app ? phoneChatUrl(playing.chat.channel, app.live[playing.chat.channel.key]) : null
  useBpInput((action) => {
    if (action === 'y' && chatOpen && phoneUrl) {
      setQrOpen(true)
      return true
    }
    if (action === 'x') {
      if (chatAvailable) setChatOpen((o) => !o)
      show()
      return true
    }
    if (action === 'lb' || action === 'rb') {
      if (route.kind === 'list') step(action === 'lb' ? -1 : 1)
      else if (members.length > 1) {
        const at = Math.max(0, members.findIndex((m) => m.key === (sourceKey ?? liveKey)))
        setSourceKey(members[(at + (action === 'lb' ? members.length - 1 : 1)) % members.length].key)
      }
      show()
      return true
    }
    if (action === 'lt' || action === 'rt') {
      seek(action === 'lt' ? -30 : 30)
      show()
      return true
    }
    if (action === 'start') {
      toggle()
      show()
      return true
    }
    if (!shown) {
      if (action === 'back') pop()
      else if (action === 'select') toggle()
      else if (action === 'left' || action === 'right') seek(action === 'left' ? -SEEK_STEP : SEEK_STEP)
      show()
      return true
    }
    if (action === 'back') {
      clearTimeout(hideTimer.current)
      setShown(false)
      return true
    }
    show()
    return false
  })

  if (!app || !playing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-white/70">
        <p className="text-[24px]">Nothing to play.</p>
        <BpButton autoFocus onPress={pop} icon={<ArrowLeftIcon className="size-6" />}>
          Back
        </BpButton>
      </div>
    )
  }

  const hints: Hint[] = [
    ['A', shown ? 'Select' : paused ? 'Play' : 'Pause'],
    ['B', shown ? 'Hide controls' : 'Back'],
    ...(chatAvailable ? [['X', chatOpen ? 'Hide chat' : 'Chat'] as Hint] : []),
    ...(chatOpen && phoneUrl ? [['Y', 'Chat on phone'] as Hint] : []),
    ...(route.kind === 'list' ? [['LB/RB', 'Previous / next'] as Hint] : members.length > 1 ? [['LB/RB', 'Switch platform'] as Hint] : []),
    ...(!playing.live ? [['LT/RT', '−30 / +30 s'] as Hint] : [])
  ]

  return (
    <div className="flex h-full bg-black" onMouseMove={(e) => (e.movementX || e.movementY ? show() : undefined)} style={{ cursor: shown ? undefined : 'none' }}>
      <div ref={boxRef} className="relative min-w-0 flex-1">
        {playing.unavailable ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <RadioIcon className="size-16 text-white/35" strokeWidth={1.5} />
            <p className="text-[26px] font-semibold text-white">{playing.unavailable}</p>
          </div>
        ) : playing.src ? (
          <WebView
            key={playing.src}
            platform={playing.platform}
            src={playing.live ? playing.src : withStartTime(playing.src, startAt)}
            resumeAt={playing.live ? undefined : startAt}
            onProgress={playing.live ? undefined : onProgress}
            onEnded={playing.live ? undefined : onEnded}
            className="size-full"
          />
        ) : playing.hls ? (
          <HlsVideo key={playing.hls} src={playing.hls} startAt={startAt} onProgress={onProgress} onEnded={onEnded} controls={false} className="bg-black" />
        ) : null}

        {/* Controls */}
        <div
          data-bp-scope={shown ? '' : undefined}
          aria-hidden={shown ? undefined : 'true'}
          className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ${shown ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          <div className="flex items-center gap-5 px-12 pt-10 pb-16" style={{ background: 'linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.45) 60%, rgba(0,0,0,0))' }}>
            <ChannelAvatar src={playing.avatarUrl} name={playing.channelName} className="size-16 rounded-full bg-white/10 object-cover" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-3 text-[20px] font-semibold text-white/80">
                {playing.channelName}
                {playing.live && <span className="rounded-md bg-[#e5242c] px-2 py-0.5 text-[14px] font-bold text-white">LIVE</span>}
                {liveInfo?.viewers !== undefined && <span className="text-white/55">{formatViewers(liveInfo.viewers)} watching</span>}
                {liveInfo?.startedAt && <span className="text-white/55 tabular-nums">{uptime(liveInfo.startedAt)}</span>}
              </p>
              <p className="mt-1 line-clamp-1 text-[30px] leading-snug font-bold text-white">{playing.title}</p>
            </div>
            {route.kind === 'list' && <span className="text-[20px] font-semibold text-white/60 tabular-nums">{index + 1} / {items.length}</span>}
          </div>

          <div className="px-12 pt-20 pb-8" style={{ background: 'linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.9))' }}>
            {!playing.live && state && Number.isFinite(state.d) && state.d > 0 && (
              <div className="mb-6 flex items-center gap-5 text-[18px] font-semibold text-white tabular-nums">
                <span>{clockText(state.t)}</span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/25">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${Math.min(100, (state.t / state.d) * 100)}%` }} />
                </span>
                <span>{clockText(state.d)}</span>
              </div>
            )}
            <div className="flex items-center gap-4">
              <BpButton id="p-back" onPress={pop} icon={<ArrowLeftIcon className="size-6" />} title="Back" />
              {canPrev && <BpButton id="p-prev" onPress={() => step(-1)} icon={<SkipBackIcon className="size-6 fill-current" />} title="Previous" />}
              <BpButton id="p-play" autoFocus onPress={toggle} icon={paused ? <PlayIcon className="size-6 fill-current" /> : <PauseIcon className="size-6 fill-current" />}>
                {paused ? 'Play' : 'Pause'}
              </BpButton>
              {canNext && <BpButton id="p-next" onPress={() => step(1)} icon={<SkipForwardIcon className="size-6 fill-current" />} title="Next" />}
              {chatOpen && phoneUrl && (
                <BpButton id="p-qr" onPress={() => setQrOpen(true)} icon={<QrCodeIcon className="size-6" />} title="Open this chat on your phone">
                  Chat on phone
                </BpButton>
              )}
              {members.length > 1 && (
                <div className="ml-4 flex items-center gap-3">
                  {members.map((m) => {
                    const meta = PLATFORM_META[m.platform]
                    const active = m.key === (sourceKey ?? liveKey)
                    return (
                      <BpButton key={m.key} id={`p-src:${m.key}`} active={active} onPress={() => setSourceKey(m.key)} icon={<meta.Icon className="size-5" strokeWidth={2.5} />}>
                        {meta.label}
                      </BpButton>
                    )
                  })}
                </div>
              )}
            </div>
            {/* On their own line: beside the buttons they'd crowd out on a small screen (a Steam Deck with chat open). */}
            <div className="mt-5">
              <Hints hints={hints} />
            </div>
          </div>
        </div>
      </div>
      {chatOpen && playing.chat && (
        <div className="flex w-[420px] shrink-0 flex-col border-l border-white/10 bg-[#0e0e12]">
          <div className="flex h-14 shrink-0 items-center gap-2 px-5 text-[17px] font-semibold text-white/80">
            {(() => {
              const meta = PLATFORM_META[playing.chat.channel.platform]
              return <meta.Icon className="size-4" strokeWidth={2.5} />
            })()}
            {playing.chat.channel.displayName} chat
          </div>
          <WebView key={playing.chat.src} platform={playing.chat.channel.platform} src={playing.chat.src} css={CHAT_READ_ONLY_CSS} className="min-h-0 flex-1" />
        </div>
      )}
      {qrOpen && phoneUrl && playing.chat && (
        <ChatQr
          url={phoneUrl}
          name={playing.chat.channel.displayName}
          platform={playing.chat.channel.platform}
          onClose={() => {
            setQrOpen(false)
            show()
            requestAnimationFrame(() => focusId('p-qr'))
          }}
        />
      )}
    </div>
  )
}

/** A QR code for the chat: scanned with a phone's camera, it opens the chat there to type in. */
function ChatQr({ url, name, platform, onClose }: { url: string; name: string; platform: Platform; onClose(): void }): React.JSX.Element {
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: 'M' }).then((data) => alive && setImage(data))
    return () => {
      alive = false
    }
  }, [url])
  // Only the Close button and B work while it's open.
  useBpInput((action) => {
    if (action === 'back' || action === 'y') onClose()
    return !['up', 'down', 'left', 'right', 'select'].includes(action)
  })
  useEffect(() => {
    requestAnimationFrame(() => focusFirst())
  }, [])
  const meta = PLATFORM_META[platform]
  return (
    <div data-bp-scope="" className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 backdrop-blur-md">
      <div className="flex w-[620px] flex-col items-center gap-7 rounded-3xl bg-[#1a1a21] p-12 text-center shadow-2xl ring-1 ring-white/10">
        <div>
          <p className="flex items-center justify-center gap-2.5 text-[28px] font-bold text-white">
            <meta.Icon className="size-6" strokeWidth={2.5} />
            Chat on your phone
          </p>
          <p className="mt-2 text-[18px] text-white/65">Scan with your phone's camera to open {name}'s chat in your phone's browser, and type there.</p>
        </div>
        <div className="grid size-[340px] place-items-center rounded-2xl bg-white p-3">
          {image ? <img src={image} alt={`QR code for ${url}`} className="size-full [image-rendering:pixelated]" /> : <span className="text-[16px] text-black/50">Making the code…</span>}
        </div>
        <p className="max-w-full truncate text-[15px] text-white/45">{url}</p>
        <BpButton id="qr-close" autoFocus onPress={onClose}>
          Close
        </BpButton>
      </div>
    </div>
  )
}
