import { googleFetch, googleGet, googleSignedIn } from './googleAuth'

// Sending messages in a YouTube live chat as the account connected under Accounts (issue #9). The
// chat itself is YouTube's page in a <webview>, which only knows YouTube's website sign-in, so it
// showed "Sign in to chat" however YouTube was connected. Its message box is hidden and StreamHub's
// own (ChatPanel) sends through the Data API with the app's YouTube sign-in instead; the message then
// shows up in the page's chat like any other.

const API = 'https://www.googleapis.com/youtube/v3'

export type ChatSendResult = { ok: true } | { ok: false; error: string; reconnect?: boolean }

/** Live chat ids by video id (a stream keeps its chat). */
const chatIds = new Map<string, string>()

async function liveChatId(videoId: string): Promise<string | null> {
  const known = chatIds.get(videoId)
  if (known) return known
  const res = await googleGet<{ items?: Array<{ liveStreamingDetails?: { activeLiveChatId?: string } }> }>(
    `${API}/videos?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}`
  )
  const id = res.items?.[0]?.liveStreamingDetails?.activeLiveChatId ?? null
  if (id) chatIds.set(videoId, id)
  return id
}

export async function sendYouTubeChat(videoId: string, text: string): Promise<ChatSendResult> {
  const message = text.trim().slice(0, 200)
  if (!message) return { ok: false, error: 'Type a message first' }
  if (!(await googleSignedIn())) return { ok: false, error: 'Connect YouTube in Accounts to chat', reconnect: true }
  try {
    const chatId = await liveChatId(videoId)
    if (!chatId) return { ok: false, error: "This stream's chat is off" }
    const res = await googleFetch(`${API}/liveChatMessages?part=snippet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ snippet: { liveChatId: chatId, type: 'textMessageEvent', textMessageDetails: { messageText: message } } })
    })
    if (res.ok) return { ok: true }
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; errors?: Array<{ reason?: string }> } } | null
    const reason = body?.error?.errors?.[0]?.reason
    // Signed in before chat was added: read-only access.
    if (res.status === 403 && /insufficient(Permissions|Scopes)?|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(`${reason} ${body?.error?.message}`)) {
      return { ok: false, error: 'Connect YouTube again to allow chatting', reconnect: true }
    }
    if (reason === 'liveChatEnded' || reason === 'liveChatNotFound') chatIds.delete(videoId)
    return { ok: false, error: friendly(reason) ?? body?.error?.message ?? `YouTube said no (HTTP ${res.status})` }
  } catch (e) {
    const m = (e as Error).message
    return { ok: false, error: m.replace(/^youtube: /, ''), reconnect: /sign-in expired|not signed in/.test(m) }
  }
}

function friendly(reason: string | undefined): string | null {
  switch (reason) {
    case 'liveChatEnded':
    case 'liveChatNotFound':
      return 'This chat has ended'
    case 'liveChatDisabled':
      return "This stream's chat is off"
    case 'forbidden':
    case 'userBannedFromChat':
      return "You can't chat here (members-only, subscribers-only, or you're blocked)"
    case 'rateLimitExceeded':
      return 'Slow mode: wait a moment before sending again'
    case 'quotaExceeded':
      return "StreamHub has used up today's YouTube chat allowance; try again tomorrow"
    default:
      return null
  }
}
