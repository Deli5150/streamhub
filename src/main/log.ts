import { app } from 'electron'
import { format } from 'node:util'
import { redactLog } from '@shared/feedback'

// The last few hundred lines the app logged, kept in memory so a bug report from the Feedback
// button can include them (with tokens, emails and the home folder taken out).

const MAX_LINES = 300
const lines: string[] = []

function keep(level: string, args: unknown[]): void {
  const time = new Date().toISOString().slice(11, 19)
  for (const line of format(...args).split('\n')) lines.push(`${time} ${level}${line}`)
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
}

/** Starts keeping what's written to the console. */
export function captureLog(): void {
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
}

/** The kept lines, safe to post publicly. */
export const recentLog = (): string => redactLog(lines.join('\n'), app.getPath('home'))
