import { redactLog } from '@shared/feedback'

// The last few hundred lines the app logged (the desktop's main/log.ts), kept in memory so a bug
// report from Settings → Feedback can include them, with tokens, emails and the like taken out.

const MAX_LINES = 300
const lines: string[] = []

const show = (v: unknown): string => {
  if (typeof v === 'string') return v
  if (v instanceof Error) return v.stack ?? `${v.name}: ${v.message}`
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return String(v)
  }
}

function keep(level: string, args: unknown[]): void {
  const time = new Date().toISOString().slice(11, 19)
  for (const line of args.map(show).join(' ').split('\n')) lines.push(`${time} ${level}${line}`)
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
}

for (const [method, level] of [
  ['log', ''],
  ['warn', 'warn: '],
  ['error', 'error: ']
] as const) {
  const original = console[method].bind(console)
  console[method] = (...args: unknown[]) => {
    keep(level, args)
    original(...args)
  }
}

/** The kept lines, safe to post publicly. */
export const recentLog = (): string => redactLog(lines.join('\n'))
