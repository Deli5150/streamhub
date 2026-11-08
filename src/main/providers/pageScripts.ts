// Functions here run INSIDE platform web pages (via executeJavaScript), so each must be fully
// self-contained: no imports, no references to outer variables. They return null while the page is
// still loading, '__signed_out__' when the session isn't signed in, and plain JSON data otherwise.
// They key off links, images and text (stable) rather than CSS class names (which change often).

export interface ScrapedTwitchChannel {
  login: string
  displayName?: string
  avatarUrl?: string
}

export interface ScrapedTwitchStream extends ScrapedTwitchChannel {
  title?: string
  viewers?: string
  category?: string
}

/**
 * twitch.tv/directory/following/channels → followed channels, and whether that's all of them
 * (`complete`); when it isn't, the caller keeps the channels it already knew about.
 */
export async function twitchFollowingChannels(): Promise<{ channels: ScrapedTwitchChannel[]; complete: boolean } | string | null> {
  const w = window as unknown as { __shStart?: number }
  w.__shStart ??= Date.now()
  if (location.pathname.startsWith('/login') || document.querySelector('[data-a-target="login-button"]')) return '__signed_out__'
  const main = document.querySelector('main')
  if (!main) return null

  const RESERVED = new Set(['directory', 'settings', 'subscriptions', 'inventory', 'drops', 'wallet', 'search', 'videos', 'downloads', 'jobs', 'p', 'turbo', 'prime', 'friends', 'messages', 'payments', 'store', 'u'])
  const collect = (): Map<string, { login: string; displayName?: string; avatarUrl?: string }> => {
    const found = new Map<string, { login: string; displayName?: string; avatarUrl?: string }>()
    for (const a of Array.from(main.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      const parts = new URL(a.href, location.href).pathname.split('/').filter(Boolean)
      if (parts.length !== 1 || RESERVED.has(parts[0].toLowerCase())) continue
      const login = parts[0].toLowerCase()
      const entry = found.get(login) ?? { login }
      const img = a.querySelector('img')
      if (img && !entry.avatarUrl && /jtvnw\.net/.test(img.src)) entry.avatarUrl = img.src
      const text = (a.textContent || '').trim()
      if (text && !entry.displayName && text.toLowerCase().replace(/\s/g, '') === login) entry.displayName = text
      if (!entry.displayName && img?.alt && img.alt.toLowerCase() === login) entry.displayName = img.alt
      found.set(login, entry)
    }
    return found
  }

  let found = collect()
  // Nothing listed after 6s: no follows, or the page failed to load; count it as partial (keeps known follows).
  if (found.size === 0) return Date.now() - w.__shStart > 6_000 ? { channels: [], complete: false } : null
  const scroller =
    Array.from(document.querySelectorAll<HTMLElement>('main *')).find(
      (el) => el.scrollHeight > el.clientHeight + 200 && /auto|scroll/.test(getComputedStyle(el).overflowY)
    ) ?? document.scrollingElement!

  // Fast path: catch the page's own "ChannelFollows" request as it loads the next batch (its headers
  // carry the sign-in), then ask for the list's first page newest-first and oldest-first, 100 each.
  // Twitch only serves pages after the first with an integrity token, which a hidden window often
  // doesn't have; the two first pages need none. When they overlap they hold every follow (up to 200).
  type FollowNode = { login?: string; displayName?: string; profileImageURL?: string }
  type FollowsPage = { data?: { user?: { follows?: { edges?: Array<{ cursor?: string; node?: FollowNode | null }>; pageInfo?: { hasNextPage?: boolean } } } } }
  const replayed = await (async (): Promise<{ channels: Array<{ login: string; displayName?: string; avatarUrl?: string }>; complete: boolean } | null> => {
    let captured: { url: string; init: RequestInit; op: { variables?: Record<string, unknown> } } | null = null
    const original = window.fetch
    window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      try {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (url.includes('gql.twitch.tv') && typeof init?.body === 'string' && init.body.includes('"ChannelFollows"')) {
          const op = ([] as Array<{ operationName?: string; variables?: Record<string, unknown> }>).concat(JSON.parse(init.body)).find((o) => o.operationName === 'ChannelFollows')
          if (op) captured = { url, init, op }
        }
      } catch {
        // not a request we can reuse
      }
      return Reflect.apply(original, this, [input, init]) as Promise<Response>
    } as typeof fetch
    try {
      for (let i = 0; i < 20 && !captured; i++) {
        scroller.scrollTop = scroller.scrollHeight
        await new Promise((r) => setTimeout(r, 300))
      }
    } finally {
      window.fetch = original
    }
    if (!captured) return null
    const { url, init, op } = captured as { url: string; init: RequestInit; op: { variables?: Record<string, unknown> } }
    const out = new Map<string, { login: string; displayName?: string; avatarUrl?: string }>()
    /** One page of follows, added to `out`; null if Twitch refused it (e.g. no integrity token). */
    const page = async (order: string, cursor: string | null): Promise<{ logins: string[]; next: string | null } | null> => {
      const res: Response = await original(url, { ...init, body: JSON.stringify({ ...op, variables: { ...op.variables, limit: 100, cursor, order } }) })
      const json: FollowsPage | FollowsPage[] = await res.json()
      const follows = ([] as FollowsPage[]).concat(json)[0]?.data?.user?.follows
      if (!follows) return null
      const edges: Array<{ cursor?: string; node?: FollowNode | null }> = follows.edges ?? []
      const logins: string[] = []
      for (const e of edges) {
        const login = e.node?.login?.toLowerCase()
        if (!login) continue
        logins.push(login)
        out.set(login, { login, displayName: e.node?.displayName || undefined, avatarUrl: e.node?.profileImageURL || undefined })
      }
      const last = edges[edges.length - 1]?.cursor
      return { logins, next: follows.pageInfo?.hasNextPage && last ? last : null }
    }
    const newest = await page('DESC', null)
    if (!newest) return null
    if (!newest.next) return { channels: Array.from(out.values()), complete: true }
    const oldest = await page('ASC', null)
    if (oldest && oldest.logins.some((l) => newest.logins.includes(l))) return { channels: Array.from(out.values()), complete: true }
    // More than 200: page on from the newest end for as long as Twitch allows.
    for (let cursor: string | null = newest.next, i = 0; cursor && i < 100; i++) {
      const next = await page('DESC', cursor)
      if (!next) return { channels: Array.from(out.values()), complete: false }
      if (oldest && next.logins.some((l) => oldest.logins.includes(l))) return { channels: Array.from(out.values()), complete: true }
      cursor = next.next
    }
    return { channels: Array.from(out.values()), complete: true }
  })().catch(() => null)
  if (replayed?.channels.length) return replayed

  // Otherwise scroll until the list stops growing. Each batch of 15 also triggers a lookup per
  // channel, so a batch can take a few seconds: only stop after ~5s without a new one.
  for (let stable = 0, i = 0; stable < 10 && i < 400; i++) {
    scroller.scrollTop = scroller.scrollHeight
    await new Promise((r) => setTimeout(r, 500))
    const next = collect()
    stable = next.size === found.size ? stable + 1 : 0
    found = next
  }
  // The list can stop growing because Twitch refused the next batch, so this may not be everything.
  return { channels: Array.from(found.values()), complete: false }
}

/** twitch.tv/directory/following/live → followed channels that are live right now. */
export async function twitchFollowingLive(): Promise<ScrapedTwitchStream[] | string | null> {
  const w = window as unknown as { __shStart?: number }
  w.__shStart ??= Date.now()
  if (location.pathname.startsWith('/login') || document.querySelector('[data-a-target="login-button"]')) return '__signed_out__'
  const main = document.querySelector('main')
  if (!main) return null
  const cards = Array.from(main.querySelectorAll('article'))
  if (cards.length === 0) return Date.now() - w.__shStart > 6_000 ? [] : null

  const streams = new Map<string, { login: string; displayName?: string; avatarUrl?: string; title?: string; viewers?: string; category?: string }>()
  for (const card of cards) {
    const links = Array.from(card.querySelectorAll<HTMLAnchorElement>('a[href]'))
    const channelLink = links.find((a) => new URL(a.href, location.href).pathname.split('/').filter(Boolean).length === 1)
    if (!channelLink) continue
    const login = new URL(channelLink.href, location.href).pathname.split('/').filter(Boolean)[0].toLowerCase()
    const named = links.find((a) => (a.textContent || '').trim().toLowerCase().replace(/\s/g, '') === login)
    const heading = card.querySelector('h3, h4, [title]')
    const viewers = (card.textContent || '').match(/([\d.,]+\s*[KkMm]?)\s*viewers/)
    const categoryLink = links.find((a) => /\/directory\/(category|game)\//.test(a.href))
    const avatar = Array.from(card.querySelectorAll('img')).find((i) => /profile_image|user-default/.test(i.src))
    streams.set(login, {
      login,
      displayName: named?.textContent?.trim(),
      avatarUrl: avatar?.src,
      title: heading?.getAttribute('title') || heading?.textContent?.trim() || undefined,
      viewers: viewers?.[1],
      category: categoryLink?.textContent?.trim() || undefined
    })
  }
  return Array.from(streams.values())
}

/**
 * twitch.tv/<login>/videos?filter=archives (kind 'videos') or /clips (kind 'clips') → cards with
 * thumbnail, title, duration, views and age. Scrolls until at least `target` items have loaded (or
 * the list stops growing). Inlines its helpers because it runs inside the page.
 */
export async function twitchMedia(kind: 'videos' | 'clips', target: number): Promise<ScrapedMedia[] | null> {
  const w = window as unknown as { __shStart?: number }
  w.__shStart ??= Date.now()
  const main = document.querySelector('main')
  if (!main) return null
  const readMeta = (text: string): { durationText?: string; viewCountText?: string; publishedText?: string } => ({
    durationText: text.match(/(?:^|\s)(\d{1,2}:\d{2}(?::\d{2})?)(?=\s|$)/)?.[1],
    viewCountText: text.match(/([\d.,]+\s*[KkMm]?\s+views?)/)?.[1],
    publishedText: text.match(/(\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago|Yesterday)/i)?.[1]
  })
  const isThumb = (src: string): boolean => Boolean(src) && !/boxart|profile_image|twilight-static|user-default/.test(src)
  const pattern = kind === 'videos' ? /^\/videos\/(\d+)/ : /\/clip\/([\w-]+)/
  const collect = (): Map<string, ScrapedMedia> => {
    const found = new Map<string, ScrapedMedia>()
    for (const a of Array.from(main.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      const id = new URL(a.href, location.href).pathname.match(pattern)?.[1]
      if (!id) continue
      // The card: the closest ancestor that also holds a thumbnail image.
      let card: Element | null = a
      for (let i = 0; i < 8 && card && !Array.from(card.querySelectorAll('img')).some((im) => isThumb(im.src)); i++) card = card.parentElement
      const item = found.get(id) ?? { id, title: '' }
      const heading = a.querySelector('h3, h4') ?? card?.querySelector('h3, h4')
      if (!item.title) item.title = heading?.getAttribute('title') || heading?.textContent?.trim() || a.getAttribute('title') || ''
      item.thumbnail ??= Array.from(card?.querySelectorAll('img') ?? []).find((im) => isThumb(im.src))?.src
      // innerText keeps line breaks between elements (textContent would run "6:17:42" into "3.1K views").
      Object.assign(item, Object.fromEntries(Object.entries(readMeta(((card as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' '))).filter(([k, v]) => v && !(item as unknown as Record<string, unknown>)[k])))
      found.set(id, item)
    }
    return found
  }
  let found = collect()
  if (found.size === 0) return Date.now() - w.__shStart > 6_000 ? [] : null
  const scroller =
    Array.from(document.querySelectorAll<HTMLElement>('main *')).find(
      (el) => el.scrollHeight > el.clientHeight + 200 && /auto|scroll/.test(getComputedStyle(el).overflowY)
    ) ?? document.scrollingElement!
  for (let stable = 0, i = 0; found.size < target && stable < 4 && i < 60; i++) {
    scroller.scrollTop = scroller.scrollHeight
    await new Promise((r) => setTimeout(r, 400))
    const next = collect()
    stable = next.size === found.size ? stable + 1 : 0
    found = next
  }
  // Thumbnails lazy-load as cards scroll into view; walk back up once so every card has one.
  scroller.scrollTop = 0
  for (let y = 0; y < scroller.scrollHeight; y += 700) {
    scroller.scrollTop = y
    await new Promise((r) => setTimeout(r, 120))
  }
  return Array.from(collect().values())
}

export interface ScrapedYouTubeChannel {
  id: string
  displayName: string
  avatarUrl?: string
}

/** youtube.com/feed/channels → every subscribed channel. */
export async function youtubeSubscriptions(): Promise<ScrapedYouTubeChannel[] | string | null> {
  const w = window as unknown as { __shStart?: number; ytInitialData?: unknown }
  w.__shStart ??= Date.now()
  if (!w.ytInitialData || !document.querySelector('ytd-app')) return null
  if (document.querySelector('ytd-masthead a[href*="ServiceLogin"], #masthead a[href*="ServiceLogin"]')) return '__signed_out__'

  const found = new Map<string, { id: string; displayName: string; avatarUrl?: string }>()
  const text = (t: unknown): string | undefined => {
    const o = t as { simpleText?: string; runs?: Array<{ text: string }>; content?: string } | undefined
    return o?.simpleText ?? o?.runs?.map((r) => r.text).join('') ?? o?.content
  }
  const visit = (node: unknown, depth = 0): void => {
    if (!node || typeof node !== 'object' || depth > 40) return
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1))
    const o = node as Record<string, unknown>
    if (typeof o.channelId === 'string' && /^UC[\w-]{22}$/.test(o.channelId) && o.title) {
      const thumbs = (o.thumbnail as { thumbnails?: Array<{ url: string }> } | undefined)?.thumbnails
      const name = text(o.title)
      if (name && !found.has(o.channelId)) {
        const url = thumbs?.[thumbs.length - 1]?.url
        found.set(o.channelId, { id: o.channelId, displayName: name, avatarUrl: url?.startsWith('//') ? `https:${url}` : url })
      }
    }
    for (const v of Object.values(o)) visit(v, depth + 1)
  }
  const collect = (): void => {
    visit(w.ytInitialData)
    for (const el of Array.from(document.querySelectorAll('ytd-channel-renderer, ytd-grid-channel-renderer'))) {
      const e = el as unknown as { data?: unknown; __data?: { data?: unknown } }
      visit(e.data ?? e.__data?.data)
    }
  }

  collect()
  // More subscriptions load as you scroll.
  for (let stable = 0, i = 0, last = found.size; stable < 4 && i < 150; i++) {
    window.scrollTo(0, document.documentElement.scrollHeight)
    await new Promise((r) => setTimeout(r, 400))
    collect()
    stable = found.size === last ? stable + 1 : 0
    last = found.size
  }
  if (found.size === 0 && Date.now() - w.__shStart < 6_000) return null
  return Array.from(found.values())
}

export interface ScrapedMedia {
  id: string
  title: string
  thumbnail?: string
  durationText?: string
  viewCountText?: string
  publishedText?: string
}

/**
 * Collects items from YouTube channel-tab data (`ytInitialData`, or renderer `.data` objects while
 * scrolling). Self-contained so it runs both in the main process and injected into the page. Skips
 * live and upcoming entries; `more` says whether YouTube offered another page.
 */
export function collectYouTubeTab(root: unknown, kind: 'streams' | 'videos' | 'shorts'): { items: ScrapedMedia[]; more: boolean } {
  const items = new Map<string, { id: string; title: string; thumbnail?: string; durationText?: string; viewCountText?: string; publishedText?: string }>()
  let more = false
  const text = (t: unknown): string | undefined => {
    const o = t as { simpleText?: string; runs?: Array<{ text: string }>; content?: string } | undefined
    return o?.simpleText ?? o?.runs?.map((r) => r.text).join('') ?? o?.content
  }
  const biggest = (list: unknown): string | undefined => {
    const arr = (list as Array<{ url: string; width?: number }> | undefined) ?? []
    return [...arr].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url
  }
  const visit = (node: unknown, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > 60) return
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1))
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'continuationCommand' || k === 'continuationItemRenderer') more = true
      const o = v as Record<string, any>
      if (k === 'lockupViewModel' && o && kind !== 'shorts') {
        const json = JSON.stringify(o)
        if (/BADGE_STYLE_LIVE|"LIVE"|UPCOMING|"Scheduled for/.test(json)) continue
        const meta = o.metadata?.lockupMetadataViewModel
        const parts: string[] = []
        for (const row of meta?.metadata?.contentMetadataViewModel?.metadataRows ?? [])
          for (const part of row.metadataParts ?? []) if (part.text?.content) parts.push(part.text.content)
        const badges = (json.match(/"thumbnailBadgeViewModel":\{[^}]*?"text":"([^"]+)"/g) ?? []).map((b) => b.replace(/.*"text":"/, '').replace(/"$/, ''))
        const id = o.contentId as string | undefined
        if (id && o.contentType !== 'LOCKUP_CONTENT_TYPE_PLAYLIST') {
          items.set(id, {
            id,
            title: text(meta?.title) ?? '',
            thumbnail: biggest(o.contentImage?.thumbnailViewModel?.image?.sources),
            durationText: badges.find((b) => /^\d+:\d{2}(:\d{2})?$/.test(b)),
            viewCountText: parts.find((p) => /view/i.test(p)),
            publishedText: parts.find((p) => /ago|yesterday/i.test(p))
          })
        }
        continue
      }
      if ((k === 'videoRenderer' || k === 'gridVideoRenderer') && o?.videoId && kind !== 'shorts') {
        if (/BADGE_STYLE_TYPE_LIVE_NOW|"UPCOMING"/.test(JSON.stringify(o))) continue
        items.set(o.videoId, {
          id: o.videoId,
          title: text(o.title) ?? '',
          thumbnail: biggest(o.thumbnail?.thumbnails),
          durationText: text(o.lengthText),
          viewCountText: text(o.viewCountText),
          publishedText: text(o.publishedTimeText)
        })
        continue
      }
      if (k === 'shortsLockupViewModel' && o && kind === 'shorts') {
        const endpoint = o.onTap?.innertubeCommand?.reelWatchEndpoint
        const id = (endpoint?.videoId as string | undefined) ?? String(o.entityId ?? '').replace(/^shorts-shelf-item-/, '')
        if (id) {
          items.set(id, {
            id,
            title: o.overlayMetadata?.primaryText?.content ?? '',
            thumbnail: biggest(o.thumbnail?.sources) ?? biggest(endpoint?.thumbnail?.thumbnails) ?? `https://i.ytimg.com/vi/${id}/oardefault.jpg`,
            viewCountText: o.overlayMetadata?.secondaryText?.content
          })
        }
        continue
      }
      if (k === 'reelItemRenderer' && o?.videoId && kind === 'shorts') {
        items.set(o.videoId, {
          id: o.videoId,
          title: text(o.headline) ?? '',
          thumbnail: biggest(o.thumbnail?.thumbnails),
          viewCountText: text(o.viewCountText)
        })
        continue
      }
      visit(v, depth + 1)
    }
  }
  visit(root, 0)
  return { items: Array.from(items.values()), more }
}
