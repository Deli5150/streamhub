import crypto from 'node:crypto'
import type { ChatEmote, ChatEmoteSet, ChatSendResult, ChatTarget } from '@shared/types'
import { EMOJI_SET } from '@shared/emoji'
import { commentsToken, customEmotesIn, emotesInChatPage, kickMessage, parseIrc, type IrcLine } from '@shared/chatText'
import { getJson, getText, sessionFor } from './net'
import { store } from './store'
import { YOUTUBE_EMOTES, YOUTUBE_EMOTES_OWNER, youtubeEmoteUrl } from '@shared/youtubeEmotes'
import { googleFetch, googleSignedIn } from './googleAuth'
import { prepareYouTubeChat, sendYouTubeChat } from './youtubeChat'

// StreamHub's own chat box (renderer ChatPanel): the platform's chat page stays in its <webview> for
// reading, its own message box is hidden, and messages are sent from here as your account on that
// platform, the way its website sends them (they then show up in the page's chat like any other):
// - Twitch: its chat server (IRC over WebSocket), signed in with your twitch.tv sign-in.
// - Kick and Rumble: the endpoints their chat pages post to, with the platform's session.
// - YouTube: the Data API, with the YouTube account connected under Accounts (youtubeChat.ts).
// The emote picker lists what the platform's own picker would: your emotes and the channel's, then
// the platform's global ones (and emoji).

const TWITCH_WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
const TWITCH_IRC = 'wss://irc-ws.chat.twitch.tv:443'
/** How long a sent message waits for Twitch to turn it down before counting as sent. */
const TWITCH_VERDICT_MS = 2500
const TWITCH_IDLE_MS = 10 * 60_000
const EMOTES_CACHE_MS = 10 * 60_000

export async function sendChat(t: ChatTarget, text: string): Promise<ChatSendResult> {
  const message = text.trim()
  if (!message) return { ok: false, error: 'Type a message first' }
  try {
    switch (t.platform) {
      case 'youtube':
        return t.streamId ? await sendYouTubeChat(t.streamId, message) : { ok: false, error: "This stream's chat isn't available" }
      case 'twitch':
        return await twitchChat.send(t.channelId.toLowerCase(), message.slice(0, 500))
      case 'kick':
        return await sendKick(t.channelId, message.slice(0, 500))
      case 'rumble':
        return t.chatId ? await sendRumble(t.chatId, message.slice(0, 200)) : { ok: false, error: "This stream's chat isn't available" }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Gets a chat ready to send as soon as its box shows: connects to Twitch's chat server and joins the
 * channel, looks up Kick's chatroom and emotes and YouTube's chat id. Otherwise the first message
 * waited on all of that before it went out.
 */
export async function prepareChat(t: ChatTarget): Promise<void> {
  switch (t.platform) {
    case 'youtube':
      if (t.streamId) await prepareYouTubeChat(t.streamId)
      return
    case 'twitch':
      return twitchChat.prepare(t.channelId.toLowerCase())
    case 'kick':
      await Promise.all([kickRoom(t.channelId), kickEmoteIds.has(t.channelId) ? null : kickEmotes(t.channelId)]).catch(() => undefined)
      return
    case 'rumble':
      return
  }
}

const emoteCache = new Map<string, { at: number; sets: Promise<ChatEmoteSet[]> }>()

export function chatEmotes(t: ChatTarget): Promise<ChatEmoteSet[]> {
  // YouTube's grow as emotes are seen in chats.
  if (t.platform === 'youtube') return youtubeEmotes(t)
  const key = `${t.platform}:${t.channelId}:${t.chatId ?? ''}`
  const hit = emoteCache.get(key)
  if (hit && Date.now() - hit.at < EMOTES_CACHE_MS) return hit.sets
  const sets = loadEmotes(t)
  emoteCache.set(key, { at: Date.now(), sets })
  sets.catch(() => emoteCache.delete(key))
  return sets
}

async function loadEmotes(t: ChatTarget): Promise<ChatEmoteSet[]> {
  switch (t.platform) {
    case 'twitch':
      return [...(await twitchEmotes(t.channelId.toLowerCase())), EMOJI_SET]
    case 'kick':
      return kickEmotes(t.channelId)
    case 'rumble':
      return [...(t.chatId ? await rumbleEmotes(t.chatId).catch(() => []) : []), EMOJI_SET]
    case 'youtube':
      return youtubeEmotes(t)
  }
}

// ---------- YouTube ----------
// YouTube lists its emotes (its own, and the channel's member emotes) only to its website, signed
// in, and not in its API. So the picker shows YouTube's own set (shared/youtubeEmotes.ts) plus every
// YouTube and channel emote seen in chats: in the chat page's recent messages when the picker opens,
// and in messages as they arrive (the chat box reports them, rememberYouTubeEmotes). They're kept, so
// a channel's set fills in as its members use their emotes. Sent as :name:, YouTube shows them as
// emotes (members-only ones only for members).

const MAX_PER_CHANNEL = 400

/**
 * Keeps emotes seen in a channel's chat. YouTube's own are told apart by their owner when known,
 * otherwise by name: channel emotes' names start with an underscore (:_name:).
 */
export function rememberYouTubeEmotes(channelId: string, seen: Array<{ code: string; url: string; owner?: string }>): void {
  const saved = store.get('ytEmotes')
  const youtube = { ...saved.youtube }
  const channel = { ...(saved.channels[channelId] ?? {}) }
  let changed = false
  for (const e of seen) {
    if (!/^:[\w-]+:$/.test(e.code) || !/^https:\/\/yt\d\.ggpht\.com\//.test(e.url)) continue
    const own = e.owner ? e.owner === YOUTUBE_EMOTES_OWNER : !e.code.startsWith(':_')
    const into = own ? youtube : channel
    const url = youtubeEmoteUrl(e.url)
    if (into[e.code] === url) continue
    if (!own && !(e.code in channel) && Object.keys(channel).length >= MAX_PER_CHANNEL) continue
    into[e.code] = url
    changed = true
  }
  if (changed) store.set('ytEmotes', { youtube, channels: { ...saved.channels, [channelId]: channel } })
}

const chatPageRead = new Map<string, number>()
const catalogRead = new Map<string, number>()
const CATALOG_EVERY_MS = 6 * 60 * 60_000

/**
 * Which of a channel's (members') emotes you can use, by channel: known when YouTube answered the
 * comment-section request signed in as you (it marks the ones you haven't unlocked), otherwise not
 * known, and they all show locked.
 */
const memberEmotes = new Map<string, Set<string>>()

/**
 * A channel's whole emote list (and YouTube's own), from the comment section of its latest video:
 * YouTube sends the emotes there for its comment box, signed out too. It's YouTube's website's own
 * request (youtubei/v1/next), so it may change without notice; the chat's emotes still fill in then.
 * It's asked with your YouTube sign-in first, so the members' emotes you've unlocked are marked so.
 */
async function youtubeCatalog(channelId: string): Promise<void> {
  const page = (path: string): Promise<string> => getText('youtube', `https://www.youtube.com/channel/${encodeURIComponent(channelId)}/${path}`)
  const latest = async (path: string): Promise<string | null> => /"videoId":"([\w-]{11})"/.exec(await page(path).catch(() => ''))?.[1] ?? null
  const video = (await latest('videos')) ?? (await latest('streams'))
  if (!video) return
  const watch = await getText('youtube', `https://www.youtube.com/watch?v=${video}`)
  const token = commentsToken(watch)
  if (!token) return
  const clientVersion = /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(watch)?.[1] ?? '2.20261112.00.00'
  const url = 'https://www.youtube.com/youtubei/v1/next?prettyPrint=false'
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion, hl: 'en' } }, continuation: token })
  }
  type Answer = { responseContext?: { mainAppWebResponseContext?: { loggedOut?: boolean } } }
  let data: Answer | null = null
  if (await googleSignedIn()) {
    const res = await googleFetch(url, init).catch(() => null)
    const answer = res?.ok ? ((await res.json().catch(() => null)) as Answer | null) : null
    if (answer?.responseContext?.mainAppWebResponseContext?.loggedOut === false) data = answer
    console.log(`[youtube] channel emotes for ${channelId}: ${data ? 'signed in, your unlocked emotes are known' : `signed in request not accepted (${res?.status ?? 'failed'}), all shown locked`}`)
  }
  const signedIn = Boolean(data)
  data ??= await getJson<Answer>('youtube', url, init)
  const emotes = customEmotesIn(data)
  if (signedIn) memberEmotes.set(channelId, new Set(emotes.filter((e) => e.owner === channelId && !e.locked).map((e) => e.code)))
  rememberYouTubeEmotes(channelId, emotes)
}

async function youtubeEmotes(t: ChatTarget): Promise<ChatEmoteSet[]> {
  // The channel's list, every few hours; and the chat page's recent messages, every few minutes.
  const reads: Array<Promise<void>> = []
  if (Date.now() - (catalogRead.get(t.channelId) ?? 0) > CATALOG_EVERY_MS) {
    catalogRead.set(t.channelId, Date.now())
    reads.push(youtubeCatalog(t.channelId).catch((e) => console.warn('[youtube] channel emotes:', (e as Error).message)))
  }
  if (t.streamId && Date.now() - (chatPageRead.get(t.streamId) ?? 0) > 5 * 60_000) {
    chatPageRead.set(t.streamId, Date.now())
    const streamId = t.streamId
    reads.push(
      getText('youtube', `https://www.youtube.com/live_chat?v=${encodeURIComponent(streamId)}`)
        .then((html) => rememberYouTubeEmotes(t.channelId, emotesInChatPage(html)))
        .catch(() => undefined)
    )
  }
  await Promise.all(reads)
  const saved = store.get('ytEmotes')
  const toEmote = ([code, url]: [string, string]): ChatEmote => ({ code, name: code.replace(/^:_?|:$/g, ''), url })
  // Members' emotes show locked unless YouTube said you've unlocked them.
  const unlocked = memberEmotes.get(t.channelId)
  const channel = Object.entries(saved.channels[t.channelId] ?? {}).map((e) => ({ ...toEmote(e), locked: !unlocked?.has(e[0]) }))
  const youtube = new Map(YOUTUBE_EMOTES.map(([code, url]) => [code, youtubeEmoteUrl(url)]))
  for (const [code, url] of Object.entries(saved.youtube)) youtube.set(code, url)
  return [
    ...(channel.length ? [{ title: t.channelName || 'Channel', emotes: channel }] : []),
    { title: 'YouTube', emotes: [...youtube].map(toEmote) },
    EMOJI_SET
  ]
}

// ---------- Twitch ----------

async function twitchCookie(name: string): Promise<string | undefined> {
  const [c] = await sessionFor('twitch').cookies.get({ url: 'https://www.twitch.tv', name })
  return c?.value ? decodeURIComponent(c.value) : undefined
}

const twitchEmoteUrl = (id: string): string => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`

interface TwitchEmotesResponse {
  data?: {
    user?: { displayName?: string; subscriptionProducts?: Array<{ tier?: string; emotes?: Array<{ id: string; token: string }> | null }> | null } | null
    currentUser?: { emoteSets?: Array<{ id: string; owner?: { login?: string; displayName?: string } | null; emotes?: Array<{ id: string; token: string }> | null }> | null } | null
    global?: { emotes?: Array<{ id: string; token: string }> | null } | null
  }
}

async function twitchEmotes(login: string): Promise<ChatEmoteSet[]> {
  const token = await twitchCookie('auth-token')
  const query = `{ user(login: ${JSON.stringify(login)}) { displayName subscriptionProducts { tier emotes { id token } } } global: emoteSet(id: "0") { emotes { id token } }${
    token ? ' currentUser { emoteSets { id owner { login displayName } emotes { id token } } }' : ''
  } }`
  const res = await getJson<TwitchEmotesResponse>('twitch', 'https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Client-Id': TWITCH_WEB_CLIENT_ID, 'Content-Type': 'application/json', ...(token ? { Authorization: `OAuth ${token}` } : {}) },
    body: JSON.stringify({ query })
  })
  const d = res.data ?? {}
  const toEmote = (e: { id: string; token: string }, locked = false): ChatEmote => ({ code: e.token, name: e.token, url: twitchEmoteUrl(e.id), locked })
  const sets: ChatEmoteSet[] = []
  // Yours: every emote your account can use (subscriptions, follower emotes, Turbo...), the
  // watched channel's first. Global emotes come in their own set below.
  const mine = (d.currentUser?.emoteSets ?? []).filter((s) => s.id !== '0' && s.emotes?.length)
  const usable = new Set(mine.flatMap((s) => (s.emotes ?? []).map((e) => e.id)))
  const channelName = d.user?.displayName || login
  const ofChannel = mine.filter((s) => s.owner?.login === login)
  const others = mine.filter((s) => s.owner?.login !== login)
  const channelEmotes = (d.user?.subscriptionProducts ?? []).flatMap((p) => p.emotes ?? [])
  const channelSet = [
    ...ofChannel.flatMap((s) => s.emotes ?? []).map((e) => toEmote(e)),
    ...channelEmotes.filter((e) => !usable.has(e.id)).map((e) => toEmote(e, true))
  ]
  if (channelSet.length) sets.push({ title: channelName, emotes: dedupe(channelSet) })
  const otherEmotes = others.flatMap((s) => s.emotes ?? []).map((e) => toEmote(e))
  if (otherEmotes.length) sets.push({ title: 'Your emotes', emotes: dedupe(otherEmotes) })
  const global = (d.global?.emotes ?? []).map((e) => toEmote(e))
  if (global.length) sets.push({ title: 'Twitch', emotes: dedupe(global) })
  return sets
}

const dedupe = (emotes: ChatEmote[]): ChatEmote[] => {
  const seen = new Set<string>()
  return emotes.filter((e) => !seen.has(e.code) && Boolean(seen.add(e.code)))
}

/**
 * One connection to Twitch's chat server, opened on the first message and closed after a while
 * unused. Joining a channel lets its notices through: Twitch answers a message it turns down
 * (followers-only, slow mode, timed out...) with a NOTICE, and one it accepts with a USERSTATE.
 */
class TwitchChat {
  private ws: WebSocket | null = null
  private connecting: Promise<void> | null = null
  private joined = new Map<string, Promise<void>>()
  private listeners = new Set<(l: IrcLine) => void>()
  private idle: ReturnType<typeof setTimeout> | null = null

  /** Connects and joins ahead of the first message (quietly: sending reports any problem). */
  async prepare(login: string): Promise<void> {
    const token = await twitchCookie('auth-token')
    const nick = await twitchCookie('login')
    if (!token || !nick) return
    try {
      await this.connect(token, nick)
      await this.join(login)
      this.keepAlive()
    } catch {
      this.close()
    }
  }

  async send(login: string, text: string): Promise<ChatSendResult> {
    const token = await twitchCookie('auth-token')
    const nick = await twitchCookie('login')
    if (!token || !nick) return { ok: false, error: 'Sign in to Twitch to chat', reconnect: true }
    try {
      await this.connect(token, nick)
      await this.join(login)
    } catch (e) {
      this.close()
      const m = (e as Error).message
      return { ok: false, error: m, reconnect: /authentication/i.test(m) }
    }
    this.keepAlive()
    const verdict = this.waitFor<ChatSendResult>(TWITCH_VERDICT_MS, (l) => {
      if (l.params[0] !== `#${login}`) return undefined
      if (l.command === 'NOTICE') return { ok: false, error: l.params[1] || 'Twitch turned the message down' }
      if (l.command === 'USERSTATE') return { ok: true }
      return undefined
    })
    this.ws?.send(`@client-nonce=${crypto.randomUUID().replace(/-/g, '')} PRIVMSG #${login} :${text.replace(/[\r\n]+/g, ' ')}`)
    return (await verdict) ?? { ok: true }
  }

  private connect(token: string, nick: string): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN && !this.connecting) return Promise.resolve()
    this.connecting ??= new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(TWITCH_IRC)
      this.ws = ws
      this.joined.clear()
      const fail = (m: string): void => {
        this.connecting = null
        reject(new Error(m))
      }
      const timer = setTimeout(() => fail("Couldn't reach Twitch chat"), 10_000)
      ws.onopen = () => {
        ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
        ws.send(`PASS oauth:${token}`)
        ws.send(`NICK ${nick.toLowerCase()}`)
      }
      ws.onmessage = (ev) => {
        for (const raw of String(ev.data).split('\r\n')) {
          if (!raw) continue
          if (raw.startsWith('PING')) {
            ws.send(raw.replace('PING', 'PONG'))
            continue
          }
          const line = parseIrc(raw)
          if (line.command === '001') {
            clearTimeout(timer)
            this.connecting = null
            resolve()
          } else if (line.command === 'NOTICE' && line.params[0] === '*' && this.connecting) {
            clearTimeout(timer)
            fail(/authentication/i.test(line.params[1] ?? '') ? 'Twitch sign-in expired: sign in to Twitch again' : line.params[1] || 'Twitch chat refused the sign-in')
          }
          for (const l of this.listeners) l(line)
        }
      }
      ws.onerror = () => {
        clearTimeout(timer)
        if (this.connecting) fail("Couldn't reach Twitch chat")
      }
      ws.onclose = () => {
        if (this.ws === ws) {
          this.ws = null
          this.joined.clear()
        }
      }
    })
    return this.connecting
  }

  private join(login: string): Promise<void> {
    let joining = this.joined.get(login)
    if (!joining) {
      joining = this.waitFor(5000, (l) => (l.command === 'ROOMSTATE' && l.params[0] === `#${login}` ? true : undefined)).then(() => undefined)
      this.joined.set(login, joining)
      this.ws?.send(`JOIN #${login}`)
    }
    return joining
  }

  /** Resolves with `pick`'s first answer for an incoming line, or undefined after `ms`. */
  private waitFor<T>(ms: number, pick: (l: IrcLine) => T | undefined): Promise<T | undefined> {
    return new Promise((resolve) => {
      const done = (v: T | undefined): void => {
        clearTimeout(timer)
        this.listeners.delete(listen)
        resolve(v)
      }
      const listen = (l: IrcLine): void => {
        const v = pick(l)
        if (v !== undefined) done(v)
      }
      const timer = setTimeout(() => done(undefined), ms)
      this.listeners.add(listen)
    })
  }

  private keepAlive(): void {
    if (this.idle) clearTimeout(this.idle)
    this.idle = setTimeout(() => this.close(), TWITCH_IDLE_MS)
  }

  private close(): void {
    this.ws?.close()
    this.ws = null
    this.connecting = null
    this.joined.clear()
  }
}

const twitchChat = new TwitchChat()

// ---------- Kick ----------

async function kickCookie(name: string): Promise<string | undefined> {
  const [c] = await sessionFor('kick').cookies.get({ url: 'https://kick.com', name })
  return c?.value ? decodeURIComponent(c.value) : undefined
}

interface KickEmoteSet {
  id?: number | string
  name?: string
  slug?: string
  emotes?: Array<{ id: number; name: string; subscribers_only?: boolean }>
}

/** Kick's emote names by slug, for turning picked names into the [emote:id:name] form Kick sends. */
const kickEmoteIds = new Map<string, Map<string, number>>()

async function kickEmotes(slug: string): Promise<ChatEmoteSet[]> {
  const sets = await getJson<KickEmoteSet[]>('kick', `https://kick.com/emotes/${encodeURIComponent(slug)}`)
  const ids = new Map<string, number>()
  const out: ChatEmoteSet[] = []
  for (const s of Array.isArray(sets) ? sets : []) {
    const emotes = (s.emotes ?? []).map((e) => {
      ids.set(e.name, e.id)
      return { code: e.name, name: e.name, url: `https://files.kick.com/emotes/${e.id}/fullsize`, locked: Boolean(s.slug && e.subscribers_only) }
    })
    if (emotes.length) out.push({ title: s.slug ? (s.name ?? s.slug) : s.name === 'Global' ? 'Kick' : (s.name ?? 'Emotes'), emotes })
  }
  kickEmoteIds.set(slug, ids)
  return out
}

/** Kick chatroom ids by channel (a channel keeps its chatroom). */
const kickRooms = new Map<string, number>()

async function kickRoom(slug: string): Promise<number | undefined> {
  const known = kickRooms.get(slug)
  if (known) return known
  const token = await kickCookie('session_token')
  const channel = await getJson<{ chatroom?: { id?: number } }>('kick', `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  })
  const room = channel.chatroom?.id
  if (room) kickRooms.set(slug, room)
  return room
}

async function sendKick(slug: string, text: string): Promise<ChatSendResult> {
  const token = await kickCookie('session_token')
  if (!token) return { ok: false, error: 'Sign in to Kick to chat', reconnect: true }
  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` }
  const room = await kickRoom(slug)
  if (!room) return { ok: false, error: "This channel's chat isn't available" }
  if (!kickEmoteIds.has(slug)) await kickEmotes(slug).catch(() => undefined)
  const xsrf = await kickCookie('XSRF-TOKEN')
  const res = await sessionFor('kick').fetch(`https://kick.com/api/v2/messages/send/${room}`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...headers, 'Content-Type': 'application/json', ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}) },
    body: JSON.stringify({ content: kickMessage(text, kickEmoteIds.get(slug)), type: 'message' })
  })
  if (res.ok) return { ok: true }
  const body = (await res.json().catch(() => null)) as { message?: string; status?: { message?: string } } | null
  const why = body?.status?.message || body?.message
  if (res.status === 401 || /not authenticated/i.test(why ?? '')) return { ok: false, error: 'Kick sign-in expired: sign in to Kick again', reconnect: true }
  return { ok: false, error: why || `Kick turned the message down (HTTP ${res.status})` }
}

// ---------- Rumble ----------

interface RumbleEmoteList {
  data?: { items?: Array<{ title?: string; name?: string; emotes?: Array<{ name: string; file?: string; is_subs_only?: boolean }> }> }
}

async function rumbleEmotes(chatId: string): Promise<ChatEmoteSet[]> {
  const res = await getJson<RumbleEmoteList>('rumble', `https://rumble.com/service.php?name=emote.list&chat_id=${encodeURIComponent(chatId)}`)
  return (res.data?.items ?? [])
    .map((s) => ({
      title: s.title || s.name || 'Emotes',
      emotes: (s.emotes ?? []).filter((e) => e.file).map((e) => ({ code: `:${e.name}:`, name: e.name, url: e.file, locked: Boolean(e.is_subs_only) }))
    }))
    .filter((s) => s.emotes.length)
}

async function sendRumble(chatId: string, text: string): Promise<ChatSendResult> {
  const res = await sessionFor('rumble').fetch(`https://web7.rumble.com/chat/api/chat/${encodeURIComponent(chatId)}/message`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { request_id: crypto.randomBytes(32).toString('base64').replace(/=/g, ''), message: { text }, rant: null, channel_id: null } })
  })
  const body = (await res.json().catch(() => null)) as { user?: { logged_in?: boolean }; errors?: Array<{ message?: string }> } | null
  if (body?.user?.logged_in === false) return { ok: false, error: 'Sign in to Rumble to chat', reconnect: true }
  if (res.ok && !body?.errors?.length) return { ok: true }
  return { ok: false, error: body?.errors?.[0]?.message || `Rumble turned the message down (HTTP ${res.status})` }
}
