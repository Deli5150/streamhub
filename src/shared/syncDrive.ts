import { emptyDoc, SYNC_FILE, type SyncDoc } from './sync'

// The sync file in Google Drive's hidden app folder (scope drive.appdata), over any fetch that adds
// the signed-in user's access token. Shared by the desktop and mobile apps.

const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export type AuthFetch = (url: string, init?: RequestInit) => Promise<Response>

export interface DriveFile {
  download(): Promise<SyncDoc>
  upload(doc: SyncDoc): Promise<void>
  /** The signed-in account's email address. */
  email(): Promise<string | undefined>
  /** Forget the file's id (after signing in to another account). */
  reset(): void
}

/**
 * A failed Drive request as a message for the user, from Google's error body. The usual setup
 * problems get a fix: the Drive API not enabled in the Cloud project, or Drive access not granted.
 */
export async function driveError(res: Response, what: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string; status?: string; errors?: Array<{ reason?: string }>; details?: Array<{ reason?: string; metadata?: { activationUrl?: string } }> }
  } | null
  const e = body?.error
  const reasons = [e?.status, ...(e?.errors ?? []).map((x) => x.reason), ...(e?.details ?? []).map((x) => x.reason)].filter(Boolean).join(' ')
  if (/SERVICE_DISABLED|accessNotConfigured/.test(reasons) || /has not been used in project|is disabled/i.test(e?.message ?? '')) {
    const url = e?.details?.find((d) => d.metadata?.activationUrl)?.metadata?.activationUrl ?? 'https://console.cloud.google.com/apis/library/drive.googleapis.com'
    return new Error(`Google Drive API isn't turned on for StreamHub's Google Cloud project. Enable it at ${url}, wait a minute, then press Sync now.`)
  }
  if (/insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes/i.test(`${reasons} ${e?.message ?? ''}`)) {
    return new Error('StreamHub wasn’t given access to its Google Drive folder. Turn Sync off and sign in again, and leave the Drive box ticked on Google’s page.')
  }
  return new Error(`sync: ${what} failed (HTTP ${res.status}${e?.message ? `: ${e.message}` : ''})`)
}

export function driveFile(authFetch: AuthFetch): DriveFile {
  let fileId: string | null = null

  async function json<T>(url: string): Promise<T> {
    const res = await authFetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw await driveError(res, 'Google Drive')
    return (await res.json()) as T
  }

  async function findFile(): Promise<string | null> {
    if (fileId) return fileId
    const q = encodeURIComponent(`name='${SYNC_FILE}'`)
    const res = await json<{ files?: Array<{ id: string }> }>(`${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=10`)
    fileId = res.files?.[0]?.id ?? null
    return fileId
  }

  return {
    async download() {
      const id = await findFile()
      if (!id) return emptyDoc()
      const res = await authFetch(`${DRIVE}/files/${id}?alt=media`)
      if (res.status === 404) {
        fileId = null
        return emptyDoc()
      }
      if (!res.ok) throw await driveError(res, 'download')
      const doc = (await res.json().catch(() => null)) as Partial<SyncDoc> | null
      const base = emptyDoc()
      return { ...base, ...doc, watchLater: { ...base.watchLater, ...doc?.watchLater }, logins: { ...base.logins, ...doc?.logins, entries: { ...doc?.logins?.entries } } }
    },

    async upload(doc) {
      const body = JSON.stringify(doc)
      const id = await findFile()
      if (id) {
        const res = await authFetch(`${UPLOAD}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })
        if (res.ok) return
        if (res.status !== 404) throw await driveError(res, 'upload')
        fileId = null
      }
      const boundary = `streamhub${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
      const multipart =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: SYNC_FILE, parents: ['appDataFolder'] })}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`
      const res = await authFetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipart
      })
      if (!res.ok) throw await driveError(res, 'upload')
      fileId = ((await res.json()) as { id: string }).id
    },

    async email() {
      const about = await json<{ user?: { emailAddress?: string } }>(`${DRIVE}/about?fields=user(emailAddress)`).catch(() => null)
      return about?.user?.emailAddress
    },

    reset() {
      fileId = null
    }
  }
}
