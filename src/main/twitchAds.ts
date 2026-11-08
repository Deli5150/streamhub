import { session } from 'electron'
import { TWITCH_PLAYER_PARTITION } from '@shared/urls'
import { createTwitchAdFilter, isGql, isMediaPlaylist, isUsher } from '@shared/twitchAdFilter'
import { getSettings } from './settings'

// With "Block Twitch ads" on, the Twitch video player runs in its own session whose HTTPS traffic
// passes through the ad filter (shared/twitchAdFilter.ts, which explains how ad breaks are skipped).
// Chat and follows keep using the signed-in Twitch session, which is never touched.

export {
  BACKUP_TYPES,
  accessTokenBody,
  hasAds,
  hasSegments,
  parseMaster,
  pickVariant,
  stitchPlaylist,
  stripTwitchAds,
  type BackupType,
  type Stitch,
  type Variant
} from '@shared/twitchAdFilter'

let installed = false

/** Routes the Twitch player session's HTTPS through the ad filter (once). */
export function installTwitchAdFilter(userAgent: string): void {
  if (installed) return
  installed = true
  const ses = session.fromPartition(TWITCH_PLAYER_PARTITION)
  ses.setUserAgent(userAgent)
  // The filter's own requests (backup tokens and copies) skip the filter.
  const filter = createTwitchAdFilter(
    (input, init) => ses.fetch(input, { ...init, bypassCustomProtocolHandlers: true }),
    (message) => console.log(`[twitch] ${message}`)
  )

  ses.protocol.handle('https', async (req) => {
    const blocking = getSettings().blockTwitchAds
    const url = req.url
    if (blocking && isGql(url) && req.method === 'POST') {
      const body = await req.clone().text()
      filter.rememberTokenRequest((h) => req.headers.get(h), body)
    }

    const res = await ses.fetch(req, { bypassCustomProtocolHandlers: true })
    if (!blocking || !res.ok) return res

    if (isUsher(url)) {
      const text = await res.text()
      filter.onMaster(url, text)
      return replaceBody(res, text)
    }
    if (!isMediaPlaylist(url)) return res
    return replaceBody(res, await filter.onMediaPlaylist(url, await res.text()))
  })
}

/** Same response with a new body (the original length/encoding headers no longer apply). */
function replaceBody(res: Response, body: string): Response {
  const headers = new Headers(res.headers)
  headers.delete('content-length')
  headers.delete('content-encoding')
  return new Response(body, { status: res.status, statusText: res.statusText, headers })
}
