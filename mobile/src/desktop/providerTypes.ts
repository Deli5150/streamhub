import type { Platform } from '@shared/types'
import { useLogin, type LoginRequest } from '../lib/login'

// Mobile version of the desktop's src/main/providers/types.ts. The Provider interface is the
// desktop's own; loginWindow opens the in-app sign-in screen (components/LoginSheet.tsx).

export type { Provider } from '../../../src/main/providers/types'

/**
 * Shows the platform's sign-in page. `check` runs after every navigation and on a timer; the screen
 * closes as soon as it resolves true. Rejects if the user closes it first (after one last check).
 */
export function loginWindow(p: Platform, url: string, check: () => Promise<boolean>, userAgent?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false
    let checking = false
    const finish = (ok: boolean, err?: Error): void => {
      if (done) return
      done = true
      clearInterval(timer)
      useLogin.getState().close(request)
      if (ok) resolve()
      else reject(err ?? new Error('Sign-in window closed'))
    }
    const run = (): void => {
      if (checking || done) return
      checking = true
      check()
        .then((ok) => ok && finish(true), () => {})
        .finally(() => (checking = false))
    }
    const timer = setInterval(run, 1500)
    const request: LoginRequest = {
      platform: p,
      url,
      userAgent,
      onNavigate: run,
      onClose: () => {
        // Give one last check a chance — some sites set cookies right before the user closes.
        if (done) return
        check()
          .catch(() => false)
          .then((ok) => finish(ok))
      }
    }
    useLogin.getState().open(request)
  })
}
