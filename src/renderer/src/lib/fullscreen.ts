// Taking a video out of full screen before its player goes away (the queue moving on to the next
// video). On Windows, a player removed while full screen left the whole window stuck full screen.

/**
 * Leaves full screen the way the player's own button does, and resolves once it has (or after a
 * second at the most, so the caller is never held up). A player page (<webview>) is asked to leave
 * from inside: leaving from the app's side never finishes for one, and left the app thinking it was
 * still full screen.
 */
export function leaveFullScreen(): Promise<void> {
  const el = document.fullscreenElement as (Element & { executeJavaScript?(code: string): Promise<unknown> }) | null
  if (!el) return Promise.resolve()
  return new Promise((resolve) => {
    const done = (): void => {
      document.removeEventListener('fullscreenchange', onChange)
      clearTimeout(timer)
      resolve()
    }
    const onChange = (): void => {
      if (!document.fullscreenElement) done()
    }
    const timer = setTimeout(done, 1000)
    document.addEventListener('fullscreenchange', onChange)
    if (el.tagName === 'WEBVIEW' && el.executeJavaScript) el.executeJavaScript('document.fullscreenElement && document.exitFullscreen()').catch(() => {})
    else document.exitFullscreen().catch(() => {})
  })
}
