// Skips the ads Twitch stitches into live streams. Twitch puts ad breaks into the stream itself
// (server-side), so blocking ad servers doesn't help. When a stream playlist announces an ad break,
// we fetch a second copy of the same stream under an access token of a kind that isn't served ads
// (same headers as the player's own token request) and hand the player that copy until the break
// ends, so the stream keeps playing. If no ad-free copy can be had, the ad segments are cut out.
//
// Shared by both apps: the desktop runs it on the Twitch player's network traffic
// (main/twitchAds.ts); the phone app runs it inside the Twitch player page itself, so this file must
// stay self-contained — no imports, and nothing but standard web APIs (fetch, URL, timers).

export interface BackupType {
  playerType: string
  platform: string
}
/**
 * Access-token kinds to try for an ad-free copy, in order of preference. Measured over 354 checks
 * during real ad breaks (Oct 2026): embed and picture-by-picture on web were ad-free ~58% of the
 * time at full quality; autoplay on android was ad-free every time but only offers up to 360p, so
 * it's the last resort (a tile drops to 360p for the length of the break).
 */
export const BACKUP_TYPES: BackupType[] = [
  { playerType: 'embed', platform: 'web' },
  { playerType: 'picture-by-picture', platform: 'web' },
  { playerType: 'autoplay', platform: 'android' }
]
export const typeName = (t: BackupType): string => `${t.playerType}/${t.platform}`
/** Backup copies (and the access tokens in their URLs) are reused for this long before being fetched again. */
const BACKUP_TTL_MS = 10 * 60_000
/** How long a playlist request may wait for the backup before falling back to cutting the ads. */
const BACKUP_WAIT_MS = 4_000
/** After no backup token kind gave a copy, wait this long before trying them all again. */
const BACKUP_RETRY_MS = 5_000
/** A player given segments this recently is mid-stream, so an all-ad playlist is a mid-roll. */
const PLAYING_WINDOW_MS = 30_000

/** Markers Twitch puts in a playlist while an ad break is stitched in. */
const AD_MARKER = /stitched-ad|twitch-stitched-ad|X-TV-TWITCH-AD|twitch-ad-quartile|twitch-maf-ad/i

export const hasAds = (playlist: string): boolean => AD_MARKER.test(playlist)

/** Whether a media playlist has any segments left to play. */
export const hasSegments = (playlist: string): boolean => /^#EXTINF/m.test(playlist)

/** Usher (master playlist) URL → [url, channel login]. */
export const isUsher = (url: string): RegExpMatchArray | null => url.match(/^https:\/\/usher\.ttvnw\.net\/api\/channel\/hls\/([^/.?]+)\.m3u8/)
export const isMediaPlaylist = (url: string): boolean => /^https:\/\/[^/]+\.ttvnw\.net\/.*\.m3u8(\?|$)/.test(url) && !url.includes('usher.ttvnw.net')
export const isGql = (url: string): boolean => url.startsWith('https://gql.twitch.tv/gql')

/**
 * Removes stitched ad segments from a Twitch media playlist. Only touches playlists that announce an
 * ad break; real segments are titled "live", ads aren't. Returns how many segments were dropped.
 */
export function stripTwitchAds(playlist: string): { text: string; removed: number } {
  if (!hasAds(playlist)) return { text: playlist, removed: 0 }
  const lines = playlist.split('\n')
  const out: string[] = []
  let removed = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('#EXTINF') && !/,live\s*$/.test(line)) {
      // Drop the segment (its #EXTINF and URI) and the timestamp that introduced it.
      if (out[out.length - 1]?.startsWith('#EXT-X-PROGRAM-DATE-TIME')) out.pop()
      i++
      removed++
      continue
    }
    // Low-latency prefetch hints point at upcoming ad segments during a break; ad metadata drives
    // the player's "commercial break" overlay.
    if (line.startsWith('#EXT-X-TWITCH-PREFETCH') || (line.startsWith('#EXT-X-DATERANGE') && hasAds(line))) continue
    out.push(line)
  }
  return { text: out.join('\n'), removed }
}

/** Numbering state of one media playlist as the player sees it (see stitchPlaylist). */
export interface Stitch {
  /** segment URI → the sequence number the player knows it by */
  seqOf: Map<string, number>
  lastSeq: number
  /** PROGRAM-DATE-TIME (ms) of the newest segment given to the player */
  lastTime: number
  /** where the newest segment came from: 'twitch' (the player's own stream) or a backup copy */
  source: string
  /** URIs of segments that start a new source, which get a discontinuity tag */
  breaks: Set<string>
}

/**
 * Gives the player one continuous playlist while its segments come from different copies of the
 * stream (its own, or a backup during an ad break). Each copy numbers its segments independently, so
 * passing them through as-is can make the numbering jump backwards, and the player then waits
 * forever for a segment it believes it hasn't reached. Instead every segment gets a number when it's
 * first served and keeps it; a segment from another copy that covers time the player already has
 * (by PROGRAM-DATE-TIME) is dropped; and the first segment from each new copy is marked as a
 * discontinuity so the decoder resets (copies can differ in resolution). Returns null when nothing in
 * the playlist is new to the player.
 */
export function stitchPlaylist(state: Stitch | undefined, source: string, playlist: string): { text: string; state: Stitch } | null {
  const lines = playlist.split('\n')
  const header: string[] = []
  const segments: { tags: string[]; uri: string; time: number }[] = []
  const trailer: string[] = []
  let tags: string[] = []
  let seenSegment = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('#EXTINF')) {
      const uri = lines[i + 1]?.trim() ?? ''
      const pdt = tags.find((t) => t.startsWith('#EXT-X-PROGRAM-DATE-TIME:'))
      segments.push({ tags: [...tags.filter((t) => t !== '#EXT-X-DISCONTINUITY'), line], uri, time: pdt ? Date.parse(pdt.slice(25)) || 0 : 0 })
      tags = []
      seenSegment = true
      i++
    } else if (!seenSegment && !line.startsWith('#EXT-X-PROGRAM-DATE-TIME') && !line.startsWith('#EXT-X-DISCONTINUITY') && !line.startsWith('#EXT-X-DATERANGE')) {
      header.push(line)
    } else if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME') || line.startsWith('#EXT-X-DATERANGE') || line === '#EXT-X-DISCONTINUITY') {
      tags.push(line)
    } else {
      trailer.push(line)
    }
  }
  trailer.unshift(...tags)
  const firstSeq = Number(header.find((l) => l.startsWith('#EXT-X-MEDIA-SEQUENCE:'))?.slice(22)) || 0
  const st: Stitch = state ?? { seqOf: new Map(), lastSeq: firstSeq - 1, lastTime: 0, source, breaks: new Set() }
  const kept: { tags: string[]; uri: string; seq: number }[] = []
  for (const seg of segments) {
    const known = st.seqOf.get(seg.uri)
    if (known !== undefined) {
      kept.push({ ...seg, seq: known })
      continue
    }
    if (seg.time && seg.time <= st.lastTime) continue // this moment already came from another copy
    if (state && source !== st.source) st.breaks.add(seg.uri)
    st.source = source
    st.lastSeq++
    st.seqOf.set(seg.uri, st.lastSeq)
    if (seg.time) st.lastTime = seg.time
    kept.push({ ...seg, seq: st.lastSeq })
  }
  if (!kept.length) return null
  // Forget segments long gone from the window.
  for (const [uri, seq] of st.seqOf) {
    if (seq < st.lastSeq - 60) {
      st.seqOf.delete(uri)
      st.breaks.delete(uri)
    }
  }
  const out = header.map((l) => (l.startsWith('#EXT-X-MEDIA-SEQUENCE:') ? `#EXT-X-MEDIA-SEQUENCE:${kept[0].seq}` : l))
  for (const seg of kept) {
    if (st.breaks.has(seg.uri)) out.push('#EXT-X-DISCONTINUITY')
    out.push(...seg.tags, seg.uri)
  }
  out.push(...trailer)
  return { text: out.join('\n'), state: st }
}

export interface Variant {
  url: string
  /** "1920x1080", or "" for audio-only */
  resolution: string
  frameRate: number
  bandwidth: number
}

/** Variant streams of a master (usher) playlist. */
export function parseMaster(master: string): Variant[] {
  const lines = master.split('\n').map((l) => l.trim())
  const out: Variant[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue
    const attr = (name: string): string => lines[i].match(new RegExp(`[:,]${name}=("?)([^",]*)\\1`))?.[2] ?? ''
    const url = lines.slice(i + 1).find((l) => l && !l.startsWith('#'))
    if (url) out.push({ url, resolution: attr('RESOLUTION'), frameRate: Number(attr('FRAME-RATE')) || 0, bandwidth: Number(attr('BANDWIDTH')) || 0 })
  }
  return out
}

/** The variant closest to `want` (same resolution and frame rate if offered, else nearest height). */
export function pickVariant(variants: Variant[], want: Pick<Variant, 'resolution' | 'frameRate'>): Variant | undefined {
  const height = (v: { resolution: string }): number => Number(v.resolution.split('x')[1]) || 0
  return (
    variants.find((v) => v.resolution === want.resolution && Math.round(v.frameRate) === Math.round(want.frameRate)) ??
    variants.find((v) => v.resolution === want.resolution) ??
    [...variants].filter((v) => height(v) > 0).sort((a, b) => Math.abs(height(a) - height(want)) - Math.abs(height(b) - height(want)))[0]
  )
}

/**
 * GQL body for a live access token of the given kind. Built from scratch rather than by editing the
 * player's own request, whose persisted query can't change the platform.
 */
export function accessTokenBody(login: string, type: BackupType): string {
  const query =
    'query PlaybackAccessToken_Template($login: String!, $playerType: String!, $platform: String!) { ' +
    'streamPlaybackAccessToken(channelName: $login, params: {platform: $platform, playerBackend: "mediaplayer", playerType: $playerType}) { value signature } }'
  return JSON.stringify({ operationName: 'PlaybackAccessToken_Template', query, variables: { login, ...type } })
}

/** Headers of the player's own token request that are reused for backup token requests. */
export const FORWARDED_HEADERS = ['authorization', 'client-id', 'client-integrity', 'client-session-id', 'client-version', 'device-id', 'x-device-id', 'content-type', 'accept-language']

export type FilterFetch = (input: string, init?: RequestInit) => Promise<Response>

export interface TwitchAdFilter {
  /** A GQL request the player made; its headers are kept if it asks for a live access token. */
  rememberTokenRequest(header: (name: string) => string | null | undefined, body: string): void
  /** Same, for headers already picked out (e.g. passed along from another thread). */
  setTokenHeaders(login: string, headers: Record<string, string>): void
  /** The player loaded `login`'s master playlist; starts getting backup copies ready. */
  onMaster(url: string, master: string): void
  /** What the player should get instead of this media playlist. */
  onMediaPlaylist(url: string, playlist: string): Promise<string>
  /** Master playlist URL for the same stream under another token kind, or null if there's none. */
  backupMasterUrl(usherUrl: string, type: BackupType): Promise<string | null>
}

/**
 * One filter instance per player environment. `fetch` makes the filter's own requests (backup
 * tokens and copies) without passing through the filter again; `log` reports what it did.
 */
export function createTwitchAdFilter(fetch: FilterFetch, log: (message: string) => void = () => {}): TwitchAdFilter {
  /** twitch.tv's public web client id, for token requests made before the player has made its own. */
  const TWITCH_WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
  /** login → headers of the player's latest live access-token request */
  const tokenHeaders = new Map<string, Record<string, string>>()
  /** login → the player's usher (master playlist) URL */
  const usherUrls = new Map<string, string>()
  /** media playlist URL → its channel and quality */
  const mediaInfo = new Map<string, { login: string; resolution: string; frameRate: number }>()
  /** One backup token kind's copy of a stream: its variants (their URLs carry its access token). */
  interface BackupCopy {
    type: BackupType
    variants: Variant[]
  }
  /** login → the backup copies whose tokens worked, in BACKUP_TYPES order */
  const backups = new Map<string, { copies: BackupCopy[]; at: number }>()
  const pendingBackups = new Map<string, Promise<BackupCopy[]>>()
  /** login → when the last search for backup copies came up empty */
  const backupFailedAt = new Map<string, number>()
  /** media playlist URL → the last playlist with segments the player was given for it */
  const lastServed = new Map<string, string>()
  /** media playlist URL → its numbering as the player sees it */
  const stitches = new Map<string, Stitch>()
  /** login → when its player was last given a playlist with segments (it has started playing) */
  const lastPlayedAt = new Map<string, number>()

  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))])

  /** Live-stream token from a GQL response (single or batched). */
  function streamToken(json: unknown): { value: string; signature: string } | null {
    for (const r of Array.isArray(json) ? json : [json]) {
      const t = (r as { data?: { streamPlaybackAccessToken?: { value?: string; signature?: string } } })?.data?.streamPlaybackAccessToken
      if (t?.value && t.signature) return { value: t.value, signature: t.signature }
    }
    return null
  }

  async function backupMasterUrl(usher: string, type: BackupType): Promise<string | null> {
    const login = isUsher(usher)?.[1].toLowerCase()
    if (!login) return null
    const headers = tokenHeaders.get(login) ?? { 'client-id': TWITCH_WEB_CLIENT_ID }
    const tokenRes = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: accessTokenBody(login, type)
    })
    const token = tokenRes.ok ? streamToken(await tokenRes.json()) : null
    if (!token) return null
    const url = new URL(usher)
    url.searchParams.set('sig', token.signature)
    url.searchParams.set('token', token.value)
    url.searchParams.set('p', String(Math.floor(Math.random() * 1e7)))
    return url.toString()
  }

  /**
   * Backup copies of `login`'s stream, one per backup token kind that works. Whether a copy is
   * ad-free is only checked during a break, at the quality the player is actually on: copies get
   * ads per quality, so an ad-free top quality says nothing about the 720p a small tile plays.
   */
  function backupCopies(login: string): Promise<BackupCopy[]> {
    const cached = backups.get(login)
    if (cached && Date.now() - cached.at < BACKUP_TTL_MS) return Promise.resolve(cached.copies)
    const pending = pendingBackups.get(login)
    if (pending) return pending
    if (Date.now() - (backupFailedAt.get(login) ?? 0) < BACKUP_RETRY_MS) return Promise.resolve([])
    const run = (async (): Promise<BackupCopy[]> => {
      const usher = usherUrls.get(login)
      if (!usher) return []
      const attempts = BACKUP_TYPES.map(async (type): Promise<BackupCopy | null> => {
        try {
          const url = await backupMasterUrl(usher, type)
          if (!url) return null
          const masterRes = await fetch(url)
          if (!masterRes.ok) return null
          const variants = parseMaster(await masterRes.text())
          return variants.length ? { type, variants } : null
        } catch (e) {
          log(`backup stream (${typeName(type)}) failed: ${(e as Error)?.message ?? e}`)
          return null
        }
      })
      const copies = (await Promise.all(attempts)).filter((c): c is BackupCopy => c !== null)
      if (copies.length) {
        backups.set(login, { copies, at: Date.now() })
        backupFailedAt.delete(login)
        log(`${login}: backup streams ready (${copies.map((c) => typeName(c.type)).join(', ')})`)
      } else {
        backups.delete(login)
        backupFailedAt.set(login, Date.now())
      }
      return copies
    })().finally(() => pendingBackups.delete(login))
    pendingBackups.set(login, run)
    return run
  }

  /**
   * What the player is given for a media playlist, from `source` ('twitch' or a backup copy):
   * stitched into one continuous playlist (see stitchPlaylist) and recorded for adFreePlaylist.
   */
  function serve(url: string, playlist: string, source: string): string {
    if (!hasSegments(playlist)) return playlist
    const stitched = stitchPlaylist(stitches.get(url), source, playlist)
    // Nothing new (a copy that's behind the one just played): give the player what it had.
    if (!stitched) return lastServed.get(url) ?? playlist
    if (stitches.size > 200) stitches.clear()
    stitches.set(url, stitched.state)
    if (lastServed.size > 200) lastServed.clear()
    lastServed.set(url, stitched.text)
    const login = mediaInfo.get(url)?.login
    if (login) lastPlayedAt.set(login, Date.now())
    return stitched.text
  }

  /**
   * During an ad break: the first backup copy that's ad-free at the player's quality, else the
   * playlist with the ads cut out. When cutting leaves nothing (the break fills the whole playlist):
   * at the start that's a pre-roll, which is let through so the stream starts instead of reading as
   * offline; mid-stream the player is handed its last ad-free playlist again, so it waits out the
   * break (a short stall) rather than playing the ads or thinking the channel went offline.
   */
  async function adFreePlaylist(url: string, playlist: string): Promise<string> {
    const info = mediaInfo.get(url)
    // Why no backup copy was used, for the log.
    let why = 'unknown stream'
    if (info) {
      const copies = (await withTimeout(backupCopies(info.login), BACKUP_WAIT_MS)) ?? []
      why = 'no backup streams'
      // Every copy is checked at once; the first ad-free one in preference order is used.
      let failed = false
      const checks = copies.map(async (copy): Promise<string | null> => {
        const variant = pickVariant(copy.variants, info)
        if (!variant) return null
        try {
          const res = await fetch(variant.url)
          if (!res.ok) {
            failed = true
            return null
          }
          const text = await res.text()
          return hasAds(text) ? null : text
        } catch {
          failed = true
          return null
        }
      })
      for (const check of checks) {
        const text = await check
        if (text) {
          const type = typeName(copies[checks.indexOf(check)].type)
          log(`${info.login} ${info.resolution || 'audio'}: ad break — playing the ad-free stream (${type})`)
          return serve(url, text, type)
        }
      }
      // A copy that no longer loads usually means its token expired; fetch fresh ones next time.
      if (failed) backups.delete(info.login)
      if (copies.length) why = `${copies.length === 1 ? 'the backup stream has' : `all ${copies.length} backup streams have`} ads too`
    }
    const who = info ? `${info.login} ${info.resolution || 'audio'}` : 'stream'
    const { text, removed } = stripTwitchAds(playlist)
    if (hasSegments(text)) {
      log(`${who}: no ad-free stream (${why}) — skipped ${removed} ad segment${removed === 1 ? '' : 's'}`)
      return serve(url, text, 'twitch')
    }
    const previous = lastServed.get(url)
    if (previous) {
      log(`${who}: no ad-free stream (${why}) — holding the stream through the ad break`)
      return previous
    }
    // Mid-stream at a quality not played yet (the player switched during the break): nothing of
    // this quality to hold, but the ads still mustn't play.
    if (info && Date.now() - (lastPlayedAt.get(info.login) ?? 0) < PLAYING_WINDOW_MS) {
      log(`${who}: no ad-free stream (${why}) — cut the ad break`)
      return text
    }
    log(`${who}: no ad-free stream yet (${why}) — playing the pre-roll so the stream starts`)
    return serve(url, playlist, 'twitch')
  }

  return {
    rememberTokenRequest(header, body) {
      try {
        const parsed = JSON.parse(body) as unknown
        for (const op of (Array.isArray(parsed) ? parsed : [parsed]) as { operationName?: string; variables?: { login?: string; isLive?: boolean } }[]) {
          if (!op?.operationName?.startsWith('PlaybackAccessToken') || !op.variables?.isLive || !op.variables.login) continue
          const kept: Record<string, string> = {}
          for (const h of FORWARDED_HEADERS) {
            const v = header(h)
            if (v) kept[h] = v
          }
          tokenHeaders.set(op.variables.login.toLowerCase(), kept)
        }
      } catch {
        // not JSON: not a token request
      }
    },
    setTokenHeaders(login, headers) {
      tokenHeaders.set(login.toLowerCase(), headers)
    },
    onMaster(url, master) {
      const login = isUsher(url)?.[1].toLowerCase()
      if (!login) return
      usherUrls.set(login, url)
      for (const v of parseMaster(master)) mediaInfo.set(v.url, { login, resolution: v.resolution, frameRate: v.frameRate })
      // Get the backup copies ready now, so a pre-roll (which comes with the very first playlist)
      // can be skipped at once instead of waiting on them while the player has nothing to show.
      backupCopies(login).catch(() => {})
    },
    async onMediaPlaylist(url, playlist) {
      return hasAds(playlist) ? adFreePlaylist(url, playlist) : serve(url, playlist, 'twitch')
    },
    backupMasterUrl
  }
}
