import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LockIcon, SendHorizontalIcon, SmileIcon, SparklesIcon } from 'lucide-react'
import type { ChatEmote, ChatEmoteSet, ChatTarget } from '@shared/types'
import { useUi } from '../store'
import { PLATFORM_META } from './platform'
import { Button, SearchInput } from './ui'
import type { PageHandle } from './WebView'

/**
 * Hides each platform's own message box in its chat page, which StreamHub's chat box replaces:
 * Twitch (scoped, to outrank its own display: block !important), Kick, YouTube; then any form with a
 * text box (Rumble). Big Picture shows chats read-only with it too.
 */
export const CHAT_INPUT_HIDDEN_CSS = `
  .chat-room__content .chat-input, .chat-room__content [data-test-selector="chat-input-buttons-container"],
  #chatroom-footer,
  #input-panel, yt-live-chat-message-input-renderer,
  form:has(textarea), form:has([contenteditable="true"]) { display: none !important; }
`

// Twitch's channel points live in its own chat box's tools (hidden, but still there to read and click).
const TWITCH_POINTS = `(() => {
  const s = document.querySelector('[data-test-selector="community-points-summary"]')
  if (!s) return null
  const balance = s.querySelector('[data-test-selector="copo-balance-string"]')?.textContent?.trim() || null
  return { balance, claimable: Boolean(s.querySelector('.claimable-bonus__icon, [aria-label="Claim Bonus"]')) }
})()`
const TWITCH_CLAIM = `(() => {
  const s = document.querySelector('[data-test-selector="community-points-summary"]')
  const b = s?.querySelector('.claimable-bonus__icon')?.closest('button') ?? s?.querySelector('button[aria-label="Claim Bonus"]')
  if (!b) return false
  b.click()
  return true
})()`
/**
 * StreamHub's message box under a stream's chat, the same on every platform: it sends as your
 * account there (main/chat.ts), and its emote button opens the platform's emotes for the channel
 * (yours and the channel's first, then global ones and emoji).
 */
export function ChatBox({
  target,
  page,
  onUseOwn
}: {
  target: ChatTarget
  /** The chat page, for Twitch's channel points. */
  page: React.MutableRefObject<PageHandle | null>
  onUseOwn(): void
}): React.JSX.Element {
  const meta = PLATFORM_META[target.platform]
  const connected = useUi((s) => s.app?.accounts.some((a) => a.platform === target.platform && a.connected) ?? false)
  const [text, setText] = useState('')
  const [error, setError] = useState<{ text: string; reconnect?: boolean } | null>(null)
  const [picker, setPicker] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const targetKey = `${target.platform}:${target.channelId}:${target.streamId ?? ''}:${target.chatId ?? ''}`
  useEffect(() => {
    setText('')
    setError(null)
    setPicker(false)
  }, [targetKey])

  useYouTubeEmoteWatch(target, targetKey, page)
  // The message box fits its text: as tall as its lines, up to its max height.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  const connect = (): void => {
    setError(null)
    void window.api.login(target.platform)
  }
  // Connected before the first message, so it goes out the moment you send it; renewed while the
  // box is open, as Twitch's connection closes after a while unused.
  useEffect(() => {
    if (!connected) return
    window.api.prepareChat(target)
    const timer = setInterval(() => window.api.prepareChat(target), 5 * 60_000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- targetKey stands for target
  }, [targetKey, connected])
  const sentTo = useRef(targetKey)
  sentTo.current = targetKey
  /**
   * The box clears at once and you can type the next message while this one goes out. If the
   * platform turns it down, it comes back in the box (unless you've started another) with the reason.
   */
  const send = (): void => {
    const message = text.trim()
    if (!message) return
    const to = targetKey
    setText('')
    setError(null)
    inputRef.current?.focus()
    void window.api
      .sendChat(target, message)
      .catch((e: Error) => ({ ok: false as const, error: e.message }))
      .then((r) => {
        if (r.ok || sentTo.current !== to) return
        setError({ text: r.error, reconnect: 'reconnect' in r ? r.reconnect : undefined })
        setText((now) => (now.trim() ? now : message))
      })
  }
  /** Puts an emote at the cursor, with spaces around it so the platform reads it as one. */
  const insert = (e: ChatEmote): void => {
    const el = inputRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const before = text.slice(0, start)
    const after = text.slice(end)
    const piece = `${before && !/\s$/.test(before) ? ' ' : ''}${e.code} `
    const next = before + piece + after.replace(/^\s+/, '')
    setText(next)
    requestAnimationFrame(() => {
      el?.focus()
      const at = (before + piece).length
      el?.setSelectionRange(at, at)
    })
  }

  if (!connected) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-1.5 border-t border-separator p-2.5">
        <span className="text-small text-tertiary">Sign in to {meta.label} to chat</span>
        <div className="flex gap-1.5">
          <Button variant="accent" onClick={connect}>
            Sign in
          </Button>
          <Button variant="plain" onClick={onUseOwn} title={`Show ${meta.label}'s own chat box`}>
            Use {meta.label}'s box
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="relative shrink-0 border-t border-separator p-2">
      {picker && <EmotePicker target={target} targetKey={targetKey} onPick={insert} onClose={() => setPicker(false)} />}
      {target.platform === 'twitch' && <TwitchPoints targetKey={targetKey} page={page} />}
      {error && (
        <div className="mb-1.5 flex items-center gap-2 text-small text-support-red">
          <span className="min-w-0 flex-1">{error.text}</span>
          {error.reconnect ? (
            <Button size="small" onClick={connect}>
              Sign in
            </Button>
          ) : (
            <Button size="small" variant="plain" onClick={onUseOwn} title={`Show ${meta.label}'s own chat box`}>
              Use {meta.label}'s box
            </Button>
          )}
        </div>
      )}
      <form
        className="flex items-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <div className="flex min-w-0 flex-1 items-end rounded-lg bg-control-subtle pr-1 ring-1 ring-separator focus-within:ring-2 focus-within:ring-accent">
          {/* Wraps and grows upward as you type (up to a few lines, then scrolls), instead of
              scrolling sideways. Enter sends; chat messages are one line, so line breaks become spaces. */}
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[\r\n]+/g, ' '))}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && picker) setPicker(false)
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={`Chat on ${meta.label}…`}
            maxLength={500}
            className="max-h-32 min-w-0 flex-1 resize-none bg-transparent px-3 py-1.5 text-regular leading-snug text-primary outline-none placeholder:text-tertiary"
          />
          <button
            type="button"
            onClick={() => setPicker(!picker)}
            title="Emotes"
            aria-pressed={picker}
            className={`mb-[5px] grid size-6 shrink-0 place-items-center rounded-md transition-colors ${picker ? 'bg-control text-primary' : 'text-tertiary hover:text-primary'}`}
          >
            <SmileIcon className="size-4" />
          </button>
        </div>
        <Button type="submit" variant="accent" disabled={!text.trim()} title="Send">
          <SendHorizontalIcon className="size-3.5" />
        </Button>
      </form>
    </div>
  )
}

/** YouTube's custom emotes in the chat's messages (its own and the channel's), as `:name:` and picture. */
const YOUTUBE_SEEN_EMOTES = `[...document.querySelectorAll('img.emoji[shared-tooltip-text]')]
  .filter((i) => /^https:\\/\\/yt\\d\\.ggpht\\.com\\//.test(i.src))
  .map((i) => ({ code: i.getAttribute('shared-tooltip-text'), url: i.src }))`

/**
 * YouTube doesn't list its emotes to apps, so the picker learns them from the chat: every 15 seconds
 * the emotes in its messages go to the main process, which keeps new ones (main/chat.ts).
 */
function useYouTubeEmoteWatch(target: ChatTarget, targetKey: string, page: React.MutableRefObject<PageHandle | null>): void {
  const youtube = target.platform === 'youtube'
  const targetRef = useRef(target)
  targetRef.current = target
  useEffect(() => {
    if (!youtube) return
    const reported = new Set<string>()
    const look = async (): Promise<void> => {
      const seen = ((await page.current?.run(YOUTUBE_SEEN_EMOTES)) as Array<{ code: string; url: string }> | null) ?? []
      const fresh = seen.filter((e) => e.code && !reported.has(e.code))
      if (!fresh.length) return
      for (const e of fresh) reported.add(e.code)
      window.api.reportChatEmotes(targetRef.current, fresh)
    }
    const timer = setInterval(() => void look(), 15_000)
    return () => clearInterval(timer)
  }, [youtube, targetKey, page])
}

/**
 * Twitch: a button floating above the message box with your channel points here, which glows when a
 * bonus is waiting to be collected; pressing it collects it. Hidden when the chat shows no points
 * (signed out, or a channel without them).
 */
function TwitchPoints({ targetKey, page }: { targetKey: string; page: React.MutableRefObject<PageHandle | null> }): React.JSX.Element | null {
  const [points, setPoints] = useState<{ balance: string | null; claimable: boolean } | null>(null)
  useEffect(() => {
    setPoints(null)
    const read = async (): Promise<void> => setPoints(((await page.current?.run(TWITCH_POINTS)) as typeof points) ?? null)
    void read()
    const timer = setInterval(() => void read(), 5000)
    return () => clearInterval(timer)
  }, [targetKey, page])
  if (!points) return null
  const claim = async (): Promise<void> => {
    if (points.claimable && (await page.current?.run(TWITCH_CLAIM))) setPoints({ ...points, claimable: false })
  }
  return (
    <button
      type="button"
      onClick={() => void claim()}
      title={points.claimable ? 'Collect your bonus channel points' : 'Your channel points here'}
      className={`absolute bottom-full right-2 z-20 mb-2 flex h-7 items-center gap-1.5 rounded-pill px-2.5 text-small-strong shadow-lg ring-1 backdrop-blur-md transition-all ${
        points.claimable
          ? 'animate-pulse bg-[#9146ff] text-white shadow-[0_0_14px_3px_rgba(145,70,255,0.75)] ring-[#b98aff]'
          : 'cursor-default bg-background/85 text-secondary ring-separator'
      }`}
    >
      <SparklesIcon className="size-3.5" strokeWidth={2.25} />
      {points.claimable ? 'Collect' : (points.balance ?? 'Points')}
    </button>
  )
}

/** Emote sets already loaded, by chat; the main process caches them too. */
const loaded = new Map<string, ChatEmoteSet[]>()

function EmotePicker({
  target,
  targetKey,
  onPick,
  onClose
}: {
  target: ChatTarget
  targetKey: string
  onPick(e: ChatEmote): void
  onClose(): void
}): React.JSX.Element {
  // YouTube's sets grow as emotes are seen in chat, so they're asked for each time.
  const fresh = target.platform === 'youtube'
  const [sets, setSets] = useState<ChatEmoteSet[] | null>((!fresh && loaded.get(targetKey)) || null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    if (!fresh && loaded.has(targetKey)) return
    let alive = true
    void window.api.chatEmotes(target).then((s) => {
      loaded.set(targetKey, s)
      if (alive) setSets(s)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey])

  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Element
      if (ref.current?.contains(t) || t.closest?.('[title="Emotes"]')) return
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!sets || !q) return sets ?? []
    return sets.map((s) => ({ ...s, emotes: s.emotes.filter((e) => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q)) })).filter((s) => s.emotes.length)
  }, [sets, search])

  return (
    <div
      ref={ref}
      className="absolute inset-x-2 bottom-full z-30 mb-1.5 flex h-[320px] flex-col overflow-hidden rounded-card bg-background shadow-2xl ring-1 ring-separator"
    >
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-separator p-2">
        <SearchInput autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search emotes" />
        {!search && shown.length > 1 && (
          <div className="flex gap-1 overflow-x-auto">
            {shown.map((s, i) => (
              <button
                key={s.title + i}
                onClick={() => {
                  setTab(i)
                  sectionRefs.current[i]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                }}
                className={`shrink-0 rounded-pill px-2 py-0.5 text-small-strong transition-colors ${tab === i ? 'bg-control text-primary' : 'text-tertiary hover:text-primary'}`}
              >
                {s.title}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!sets ? (
          <div className="grid h-full place-items-center text-small text-tertiary">Loading emotes…</div>
        ) : !shown.length ? (
          <div className="grid h-full place-items-center text-small text-tertiary">{search ? 'No emotes match' : 'No emotes for this chat'}</div>
        ) : (
          shown.map((s, i) => (
            <div key={s.title + i} ref={(el) => void (sectionRefs.current[i] = el)} className="mb-2">
              <div className="mb-1 px-0.5 text-small-strong text-tertiary">{s.title}</div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(36px,1fr))] gap-0.5">
                {s.emotes.map((e) => (
                  <button
                    key={e.code}
                    onClick={() => onPick(e)}
                    title={e.locked ? `${e.name} (${target.platform === 'youtube' ? 'members' : 'subscribers'} only)` : e.name}
                    className={`relative grid size-9 place-items-center rounded-md hover:bg-control ${e.locked ? 'opacity-45' : ''}`}
                  >
                    {e.url ? <img src={e.url} alt={e.name} loading="lazy" className="max-h-7 max-w-8 object-contain" /> : <span className="text-[20px] leading-none">{e.code}</span>}
                    {e.locked && <LockIcon className="absolute bottom-0.5 right-0.5 size-2.5 text-secondary" strokeWidth={2.5} />}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
