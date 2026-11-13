// Text handling for StreamHub's chat box (main/chat.ts), kept apart from Electron so it can be tested.

/** One IRC message: `@tags :prefix COMMAND params :trailing`. */
export interface IrcLine {
  tags: Record<string, string>
  command: string
  params: string[]
}

export function parseIrc(line: string): IrcLine {
  let rest = line
  const tags: Record<string, string> = {}
  if (rest.startsWith('@')) {
    const end = rest.indexOf(' ')
    for (const kv of rest.slice(1, end).split(';')) {
      const i = kv.indexOf('=')
      tags[i < 0 ? kv : kv.slice(0, i)] = i < 0 ? '' : kv.slice(i + 1).replace(/\\s/g, ' ')
    }
    rest = rest.slice(end + 1)
  }
  if (rest.startsWith(':')) rest = rest.slice(rest.indexOf(' ') + 1)
  const trailingAt = rest.indexOf(' :')
  const head = (trailingAt < 0 ? rest : rest.slice(0, trailingAt)).split(' ').filter(Boolean)
  const params = head.slice(1)
  if (trailingAt >= 0) params.push(rest.slice(trailingAt + 2))
  return { tags, command: head[0] ?? '', params }
}

/** Picked emotes go in the message box by name; Kick wants them as [emote:id:name]. */
export function kickMessage(text: string, ids: Map<string, number> | undefined): string {
  if (!ids?.size) return text
  return text.replace(/(^|\s)([A-Za-z0-9_]+)(?=\s|$)/g, (m, space: string, word: string) => {
    const id = ids.get(word)
    return id === undefined ? m : `${space}[emote:${id}:${word}]`
  })
}

interface YouTubeEmoji {
  emojiId?: string
  shortcuts?: string[]
  isCustomEmoji?: boolean
  /** Members-only and you're not one (signed out, every members' emote is). */
  isLocked?: boolean
  image?: { thumbnails?: Array<{ url?: string }> }
}

/** Custom emotes in a live chat page's data (its recent messages). */
export function emotesInChatPage(html: string): Array<{ owner: string; code: string; url: string; locked: boolean }> {
  return customEmotesIn(initialData(html))
}

/**
 * Custom emotes anywhere in a YouTube response: in chat messages ({ emoji }) and in a comment
 * section's header (customEmojis), which lists the channel's emotes and YouTube's own.
 */
export function customEmotesIn(data: unknown): Array<{ owner: string; code: string; url: string; locked: boolean }> {
  const out = new Map<string, { owner: string; code: string; url: string; locked: boolean }>()
  const add = (e: YouTubeEmoji | undefined): void => {
    if (!e?.isCustomEmoji || !e.emojiId || !e.shortcuts?.[0]) return
    const url = e.image?.thumbnails?.at(-1)?.url
    if (url) out.set(e.shortcuts[0], { owner: e.emojiId.split('/')[0], code: e.shortcuts[0], url, locked: Boolean(e.isLocked) })
  }
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(walk)
    if (!o || typeof o !== 'object') return
    add((o as { emoji?: YouTubeEmoji }).emoji)
    for (const e of (o as { customEmojis?: YouTubeEmoji[] }).customEmojis ?? []) add({ ...e, isCustomEmoji: true })
    for (const v of Object.values(o)) walk(v)
  }
  walk(data)
  return [...out.values()]
}

/** A YouTube page's ytInitialData, or null. */
export function initialData(html: string): unknown {
  const m = /(?:window\["ytInitialData"\]|var ytInitialData)\s*=\s*(\{.*?\});\s*<\/script>/s.exec(html)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

/** The token that loads a watch page's comment section, or null (comments off). */
export function commentsToken(watchHtml: string): string | null {
  let token: string | null = null
  const walk = (o: unknown): void => {
    if (token || !o || typeof o !== 'object') return
    if (Array.isArray(o)) return o.forEach(walk)
    const section = o as { sectionIdentifier?: string; contents?: Array<{ continuationItemRenderer?: { continuationEndpoint?: { continuationCommand?: { token?: string } } } }> }
    if (section.sectionIdentifier === 'comment-item-section') {
      token = section.contents?.map((c) => c.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token).find(Boolean) ?? null
      if (token) return
    }
    for (const v of Object.values(o)) walk(v)
  }
  walk(initialData(watchHtml))
  return token
}
