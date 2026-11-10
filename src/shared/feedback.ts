import { RELEASE_REPO } from './release'

// The Feedback button: a bug report or a feature idea, written in the app and finished on GitHub.
// The app only builds a link to the repo's new-issue form (.github/ISSUE_TEMPLATE) with the fields
// filled in; the person reviews it and submits it there, signed in to their own GitHub account. No
// token is built into the app (anyone could pull it out of a public app).

export type FeedbackKind = 'bug' | 'feature'

/** The "Where" / "For" options of the issue forms; the prefill must match one exactly. */
export type FeedbackWhere =
  | 'Mac'
  | 'Windows'
  | 'Linux'
  | 'Steam Deck / SteamOS'
  | 'iPhone'
  | 'Android'
  | 'Big Picture mode'
  | 'Desktop (Mac/Windows/Linux)'
  | 'Steam Deck / Big Picture'

export interface Feedback {
  kind: FeedbackKind
  title: string
  /** What happened (bug) or the idea (feature). */
  text: string
  where: FeedbackWhere[]
  version: string
  /** Bugs: recent app log lines, attached under "Screenshots or logs". */
  log?: string
}

/** GitHub rejects very long links (about 8 KB); the log is cut to fit, keeping its newest lines. */
const MAX_URL = 7_500

const FORM = {
  bug: { template: 'bug.yml', text: 'what', where: 'platform', extra: 'extra' },
  feature: { template: 'feature.yml', text: 'idea', where: 'platform', extra: null }
} as const

/** The issue form's "Where" choice for this device. */
export function feedbackWhere(kind: FeedbackKind, os: string, opts: { bigPicture?: boolean; steam?: boolean } = {}): FeedbackWhere[] {
  if (kind === 'feature') {
    if (os === 'ios') return ['iPhone']
    if (os === 'android') return ['Android']
    return [opts.steam || opts.bigPicture ? 'Steam Deck / Big Picture' : 'Desktop (Mac/Windows/Linux)']
  }
  const where: FeedbackWhere[] = []
  if (opts.steam) where.push('Steam Deck / SteamOS')
  else if (os === 'darwin') where.push('Mac')
  else if (os === 'win32') where.push('Windows')
  else if (os === 'linux') where.push('Linux')
  else if (os === 'ios') where.push('iPhone')
  else if (os === 'android') where.push('Android')
  if (opts.bigPicture) where.push('Big Picture mode')
  return where
}

const logBlock = (log: string): string => `Recent app log:\n\n\`\`\`\n${log}\n\`\`\``

/** The link to the repo's new-issue form, filled in with `f`. */
export function feedbackUrl(f: Feedback): string {
  const form = FORM[f.kind]
  const build = (log: string | undefined): string => {
    const q = new URLSearchParams({ template: form.template, title: f.title.trim() })
    q.set(form.text, f.text.trim())
    if (f.where.length) q.set(form.where, f.where.join(','))
    if (f.kind === 'bug') q.set('version', f.version)
    if (form.extra && log) q.set(form.extra, logBlock(log))
    return `https://github.com/${RELEASE_REPO}/issues/new?${q.toString()}`
  }
  let lines = f.log?.trim() ? f.log.trim().split('\n') : []
  let url = build(lines.join('\n') || undefined)
  // Too long: drop the oldest log lines until it fits (or there's no log left).
  while (url.length > MAX_URL && lines.length) {
    lines = lines.slice(Math.ceil(lines.length / 4))
    url = build(lines.length ? ['…', ...lines].join('\n') : undefined)
  }
  return url
}

/**
 * Log text that's safe to put in a public issue: no sign-in tokens or cookies, no email addresses,
 * and the home folder (which carries the computer's user name) shortened to ~.
 */
export function redactLog(log: string, home?: string): string {
  let out = log
  if (home) out = out.split(home).join('~')
  return out
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/((?:OAuth|Bearer)\s+)\S+/gi, '$1<token>')
    .replace(
      /\b((?:access_|refresh_|id_|auth[-_]?)?token|code|key|api[-_]?key|secret|client_secret|password|cookie|sig|signature|session[-_]?id)(["']?\s*[=:]\s*["']?)[^\s&"',;]+/gi,
      '$1$2<hidden>'
    )
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<hidden>')
}
