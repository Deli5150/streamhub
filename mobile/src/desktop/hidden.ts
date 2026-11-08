import type { Platform } from '@shared/types'
import { evaluate, navigate, park } from '../lib/reader'
import { AuthError } from './net'

// Mobile version of the desktop's src/main/hidden.ts: same readPage(), run in the offscreen
// reader WebViews (see lib/reader.tsx) instead of hidden Electron windows.

export type Slot = 'live' | 'follows' | 'videos' | 'clips' | 'bg-videos' | 'bg-clips'

export const SIGNED_OUT = '__signed_out__'

const queues = new Map<string, Promise<unknown>>()

/**
 * Loads `url` and re-runs `script` (an expression, may be async) every 500ms until it returns
 * something other than null/undefined. Calls for the same platform and slot run one at a time.
 */
export function readPage<T>(p: Platform, slot: Slot, url: string, script: string, timeoutMs = 45_000): Promise<T> {
  const key = `${p}:${slot}`
  const run = async (): Promise<T> => {
    const started = Date.now()
    try {
      await navigate(key, p, url)
      const deadline = started + timeoutMs
      while (Date.now() < deadline) {
        const result = await evaluate<T | string>(key, script, Math.max(1_000, deadline - Date.now()))
        if (result === SIGNED_OUT) throw new AuthError(`${p}: signed out`)
        if (result !== null && result !== undefined) {
          console.log(`[${p}] read ${new URL(url).pathname} in ${((Date.now() - started) / 1000).toFixed(1)}s`)
          return result as T
        }
        await new Promise((r) => setTimeout(r, 500))
      }
      throw new Error(`${p}: ${new URL(url).pathname} didn't finish loading`)
    } finally {
      park(key)
    }
  }
  const next = (queues.get(key) ?? Promise.resolve()).then(run, run)
  queues.set(key, next.catch(() => {}))
  return next
}
