import { BrowserWindow, ipcMain } from 'electron'
import { Bonjour, type Browser, type Service } from 'bonjour-service'
import { castTarget } from '@shared/cast'
import { resolveCastMedia, YouTubeCastError } from '@shared/castMedia'
import type { CastDevice, CastPlayRequest, CastStatus } from '@shared/types'
import { CastConnection, NS } from './castProtocol'
import { getJson } from './net'

// Cast to a TV from the desktop, as the Android app does: Chromecasts, Google TVs and TVs with
// Chromecast built in, found on the network (mDNS, _googlecast._tcp). The TV plays the stream itself
// through Google's Default Media Receiver, from the link shared/castMedia.ts finds (Twitch, Kick,
// Rumble; YouTube only lets its own apps cast). Once you pick a TV, whichever player is open sends
// its video there (renderer lib/cast.ts) until you stop casting.

const DEFAULT_RECEIVER = 'CC1AD845'

let bonjour: Bonjour | null = null
let browser: Browser | null = null
const found = new Map<string, CastDevice>()

function toDevice(s: Service): CastDevice | null {
  const txt = (s.txt ?? {}) as Record<string, string>
  const host = s.addresses?.find((a) => a.includes('.')) ?? s.referer?.address ?? s.host
  if (!host) return null
  return { id: txt.id || s.name, name: txt.fn || s.name, model: txt.md, host, port: s.port || 8009 }
}

/** Looks for TVs for a few seconds (and keeps the list); resolves with what's been found. */
async function scan(ms = 2500): Promise<CastDevice[]> {
  bonjour ??= new Bonjour()
  browser?.stop()
  browser = bonjour.find({ type: 'googlecast' }, (s) => {
    const d = toDevice(s)
    if (d) found.set(d.id, d)
  })
  await new Promise((r) => setTimeout(r, ms))
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// ── The TV being cast to ──────────────────────────────────────────────────────────────────────

interface Session {
  device: CastDevice
  conn: CastConnection
  /** The Default Media Receiver running on the TV, once launched. */
  app?: { transportId: string; sessionId: string }
}

let session: Session | null = null
let status: CastStatus = { device: null, state: 'idle' }

function publish(next: CastStatus): void {
  status = next
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('cast-status', status)
}

function end(): void {
  const s = session
  session = null
  s?.conn.removeAllListeners()
  s?.conn.close()
  publish({ device: null, state: 'idle' })
}

async function connect(device: CastDevice): Promise<Session> {
  if (session?.device.id === device.id && session.conn.isOpen) return session
  if (session) end()
  const conn = new CastConnection()
  await conn.open(device.host, device.port)
  const s: Session = { device, conn }
  session = s
  conn.on('close', () => session === s && end())
  conn.on('message', (ns: string, source: string, j: Record<string, any>) => {
    if (session !== s) return
    // Someone stopped it on the TV, or switched the TV to another app.
    if (ns === NS.receiver && j.type === 'RECEIVER_STATUS' && s.app) {
      const apps: Array<{ sessionId: string }> = j.status?.applications ?? []
      if (!apps.some((a) => a.sessionId === s.app!.sessionId)) end()
    }
    if (ns === NS.connection && j.type === 'CLOSE' && source === s.app?.transportId) end()
    if (ns === NS.media && j.type === 'MEDIA_STATUS') {
      const st = j.status?.[0]
      if (st?.playerState === 'IDLE' && st.idleReason === 'ERROR') publish({ ...status, state: 'error', error: 'The TV couldn’t play this stream' })
    }
  })
  return s
}

async function launch(s: Session): Promise<{ transportId: string; sessionId: string }> {
  if (s.app) return s.app
  const reply = (await s.conn.request(NS.receiver, 'receiver-0', { type: 'LAUNCH', appId: DEFAULT_RECEIVER })) as Record<string, any>
  if (reply.type === 'LAUNCH_ERROR') throw new Error(`The TV couldn’t open its player (${reply.reason ?? 'unknown reason'})`)
  const app = (reply.status?.applications ?? []).find((a: { appId: string }) => a.appId === DEFAULT_RECEIVER)
  if (!app) throw new Error('The TV didn’t open its player')
  s.app = { transportId: app.transportId, sessionId: app.sessionId }
  s.conn.send(NS.connection, app.transportId, { type: 'CONNECT' })
  return s.app
}

/** Sends a video to the TV (connecting to it first if needed). */
async function play(device: CastDevice, req: CastPlayRequest): Promise<void> {
  publish({ device, state: 'loading', url: req.url })
  try {
    const target = castTarget(req.platform, req.url, req.hls)
    if (!target) throw new Error('This video can’t be cast')
    const media = await resolveCastMedia(target, getJson)
    const s = await connect(device)
    const app = await launch(s)
    const reply = (await s.conn.request(NS.media, app.transportId, {
      type: 'LOAD',
      autoplay: true,
      currentTime: media.live ? undefined : req.startAt || undefined,
      media: {
        contentId: media.url,
        contentUrl: media.url,
        contentType: media.contentType,
        streamType: media.live ? 'LIVE' : 'BUFFERED',
        metadata: { metadataType: 0, title: req.title ?? 'StreamHub', subtitle: req.subtitle, images: req.thumbnail ? [{ url: req.thumbnail }] : undefined }
      }
    })) as Record<string, any>
    if (reply.type !== 'MEDIA_STATUS') throw new Error(reply.type === 'LOAD_FAILED' ? 'The TV couldn’t play this stream' : `The TV said ${reply.type ?? 'no'}`)
    if (status.url === req.url) publish({ device, state: 'playing', url: req.url })
  } catch (e) {
    if (status.url !== req.url) return
    publish({ device, state: 'error', url: req.url, error: (e as Error).message, youtubeId: e instanceof YouTubeCastError ? e.videoId : undefined })
  }
}

async function stop(): Promise<void> {
  const s = session
  if (s?.app) await s.conn.request(NS.receiver, 'receiver-0', { type: 'STOP', sessionId: s.app.sessionId }, 4000).catch(() => undefined)
  end()
}

export function registerCast(): void {
  ipcMain.handle('cast-devices', () => scan())
  ipcMain.handle('cast-status', () => status)
  ipcMain.handle('cast-play', (_e, device: CastDevice, req: CastPlayRequest) => play(device, req))
  ipcMain.handle('cast-stop', () => stop())
}

/** Leaves the TV alone when StreamHub quits (it keeps playing what it was sent, like phones do). */
export function closeCast(): void {
  browser?.stop()
  bonjour?.destroy()
  session?.conn.close()
}
