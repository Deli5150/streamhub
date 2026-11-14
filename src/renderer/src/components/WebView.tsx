import { useEffect, useRef, useState } from 'react'
import { PictureInPicture2Icon } from 'lucide-react'
import type { Platform } from '@shared/types'
import { partitionFor } from '@shared/urls'
import { useUi } from '../store'

interface WebviewElement extends HTMLElement {
  setAudioMuted(muted: boolean): void
  executeJavaScript(code: string): Promise<unknown>
  insertCSS(css: string): Promise<string>
  sendInputEvent(event: { type: 'mouseDown' | 'mouseUp' | 'mouseLeave'; x: number; y: number; button?: 'left'; clickCount?: number }): void
}

/** A loaded page, for running scripts in it. */
export interface PageHandle {
  run(code: string): Promise<unknown>
}

interface Props {
  platform: Platform
  src: string
  muted?: boolean
  /**
   * 0–1. Multi-view's mixer level, kept in sync both ways with the page's own player: changes here
   * move the player's slider (and mute), and changes made in the player come back via onVolumeChange.
   */
  volume?: number
  onVolumeChange?(volume: number, muted: boolean): void
  /** VODs: seek here once the video has loaded, then report progress every few seconds. */
  resumeAt?: number
  onProgress?(t: number, d: number): void
  /** VODs: the video played to the end (e.g. to advance a playlist). */
  onEnded?(): void
  /** Jump to `to` seconds (a new object each time, e.g. from a chapter list). */
  seek?: { to: number }
  /** Styles added to the page each time it loads (e.g. Big Picture hides chat's message box). */
  css?: string
  /** Set once the page has loaded: runs a script in it (e.g. the chat box's channel-points button). */
  pageRef?: React.MutableRefObject<PageHandle | null>
  className?: string
}

const PAUSE_VIDEOS = `document.querySelectorAll('video').forEach((v) => v.pause())`
const PLAY_VIDEOS = `document.querySelectorAll('video').forEach((v) => v.play().catch(() => {}))`

/** Embedded platform page, sharing the platform's signed-in session with the main process. */
export function WebView({ platform, src, muted = false, volume, onVolumeChange, resumeAt, onProgress, onEnded, seek, css, pageRef, className }: Props): React.JSX.Element {
  const ref = useRef<WebviewElement>(null)
  const [ready, setReady] = useState(false)
  // While this stream plays in picture-in-picture, the in-app copy is grayed out and silent.
  const inPip = useUi((s) => s.pip === src)
  const partition = partitionFor(platform, src, useUi((s) => s.app?.settings.blockTwitchAds ?? true))
  const wasInPip = useRef(false)
  const progressRef = useRef(onProgress)
  progressRef.current = onProgress
  const endedRef = useRef(onEnded)
  endedRef.current = onEnded
  const volumeChangeRef = useRef(onVolumeChange)
  volumeChangeRef.current = onVolumeChange
  // A player removed while fullscreen (the queue moving on, another video picked) takes its
  // fullscreen along; on Windows the window otherwise stayed fullscreen (see main/fullscreen.ts).
  useEffect(() => () => void window.api.playerClosed(), [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onReady = (): void => setReady(true)
    el.addEventListener('dom-ready', onReady)
    return () => el.removeEventListener('dom-ready', onReady)
  }, [])

  useEffect(() => {
    if (!pageRef) return
    const el = ref.current
    pageRef.current = ready && el ? { run: (code) => el.executeJavaScript(code).catch(() => null) } : null
    return () => {
      pageRef.current = null
    }
  }, [ready, pageRef])

  useEffect(() => {
    const el = ref.current
    if (!el || !css) return
    const add = (): void => void el.insertCSS(css).catch(() => {})
    if (ready) add()
    el.addEventListener('dom-ready', add)
    return () => el.removeEventListener('dom-ready', add)
  }, [css, ready])

  useEffect(() => {
    if (ready) ref.current?.setAudioMuted(muted || inPip)
  }, [ready, muted, inPip])

  useEffect(() => {
    if (!ready) return
    const el = ref.current
    if (inPip) {
      wasInPip.current = true
      // Players may resume themselves (e.g. after buffering), so keep them paused while PiP is open.
      const pause = (): void => void el?.executeJavaScript(PAUSE_VIDEOS).catch(() => {})
      pause()
      const timer = setInterval(pause, 1000)
      return () => clearInterval(timer)
    }
    if (wasInPip.current) {
      wasInPip.current = false
      el?.executeJavaScript(PLAY_VIDEOS).catch(() => {})
    }
  }, [ready, inPip])

  // VOD playback: once the main video has metadata, seek to the resume point and make sure it's
  // playing (leaving mute to the player: unmuting Twitch's VOD/clip player from a script stalls it); after that, report progress every 5 seconds. Some embeds (Rumble) only start
  // from a click on their play overlay, so if nothing has started after a few seconds we click the
  // middle of the player (a real input event, which counts as a user gesture).
  useEffect(() => {
    if (!ready || (resumeAt === undefined && !progressRef.current && !endedRef.current)) return
    const el = ref.current
    let started = false
    let ticks = 0
    let clicks = 0
    let ended = false
    const tick = async (): Promise<void> => {
      ticks++
      const start = started
        ? ''
        : `if (${resumeAt ?? 0} > 0 && v.currentTime < ${resumeAt ?? 0} - 5) v.currentTime = ${resumeAt ?? 0}; if (v.paused) v.play().catch(() => {});`
      // The main video is the longest one with a known length (pages can also hold ads and previews).
      // The end is caught by a hook on that video, checked every second: players often swap in
      // recommendations or loop (shorts) right after the end, so a slower look could miss it. It
      // counts as ended at the "ended" event, within a moment of the end, or when a loop wraps around.
      const r = (await el
        ?.executeJavaScript(
          `(() => { if (window.__shEnded) return 'ended'
            const vs = [...document.querySelectorAll('video')]; const v = vs.filter((x) => x.duration > 0 && Number.isFinite(x.duration)).sort((a, b) => b.duration - a.duration)[0];
            if (!v || v.duration < 60 && vs.some((x) => x.readyState === 0 && x.currentSrc)) return vs.some((x) => !x.paused) ? null : 'idle';
            if (!v.__shEndHook) {
              v.__shEndHook = true
              let last = 0
              const mark = () => { if (v.duration > 0 && Number.isFinite(v.duration)) window.__shEnded = true }
              v.addEventListener('ended', mark)
              v.addEventListener('timeupdate', () => {
                const t = v.currentTime, d = v.duration
                if (d > 30 && d - t < 0.75 && !v.paused) mark()
                else if (v.loop && last > d - 1.5 && t < last - 1) mark()
                last = t
              })
            }
            ${start} return [v.currentTime, v.duration, v.ended] })()`
        )
        .catch(() => null)) as [number, number, boolean] | 'idle' | 'ended' | null
      if (r === 'ended') {
        if (!ended) {
          ended = true
          endedRef.current?.()
        }
        return
      }
      if (r === 'idle') {
        // Only to get it going: later on, an ad between parts of a YouTube video also looks idle, and a
        // click there paused or skipped the video and left the player thinking the mouse sat over it.
        if (!started && ticks >= 3 && clicks < 2 && el) {
          clicks++
          const { width, height } = el.getBoundingClientRect()
          const at = { x: Math.round(width / 2), y: Math.round(height / 2) }
          el.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 })
          el.sendInputEvent({ type: 'mouseUp', ...at, button: 'left', clickCount: 1 })
          // Moves the pretend mouse off the player so its controls can hide again.
          el.sendInputEvent({ type: 'mouseLeave', x: -1, y: -1 })
        }
        return
      }
      if (!r) return
      started = true
      // Every 2 seconds, so closing the player loses next to nothing of where you were.
      if (Number.isFinite(r[1]) && (ticks % 2 === 0 || r[2])) progressRef.current?.(r[0], r[1])
      if (r[2] && !ended) {
        ended = true
        endedRef.current?.()
      }
    }
    const timer = setInterval(() => void tick(), 1000)
    return () => clearInterval(timer)
  }, [ready, resumeAt])

  useEffect(() => {
    if (!ready || !seek) return
    // YouTube through its player API (so its UI follows); others through the main video.
    void ref.current
      ?.executeJavaScript(
        `(() => { const t = ${Number(seek.to) || 0}; const yt = document.getElementById('movie_player')
          if (yt && typeof yt.seekTo === 'function') { yt.seekTo(t, true); yt.playVideo && yt.playVideo(); return }
          const v = [...document.querySelectorAll('video')].filter((x) => x.duration > 0).sort((a, b) => b.duration - a.duration)[0]
          if (v) { v.currentTime = t; v.play().catch(() => {}) } })()`
      )
      .catch(() => {})
  }, [ready, seek])

  useEffect(() => {
    if (!ready || volume === undefined) return
    const want = { p: Math.round(Math.max(0, Math.min(1, volume)) * 100), m: muted }
    // One script per tick does both directions inside the page, so they can't race: if the mixer
    // changed since it was last applied (window.__shApplied), push it to the player; otherwise, if the
    // player now differs from it, the viewer changed it there, so report that for the mixer to follow.
    // Each platform is driven through its own player controls so its slider and mute button show the
    // same level (setting the <video> alone changes the sound but leaves Twitch's and Kick's UI behind):
    //  - YouTube: its player API (setting its <video> would also skip its loudness normalization).
    //  - Twitch: its volume slider (a React input) and mute button.
    //  - Kick: the volume handlers of its React player controls.
    //  - Rumble and anything else: the main <video>, whose volume those players follow. Only the main
    //    (largest showing) video counts: Rumble also holds a muted scrubbing preview and ad slots. A
    //    video that becomes the main one (reload, ad) is set to the mixer level rather than read.
    // Players that mute by dropping the volume to 0 report "muted at the mixer's level", so unmuting
    // from the mixer brings the sound back instead of unmuting at 0.
    const script = `(() => {
      const want = ${JSON.stringify(want)}
      const same = (a, b) => Boolean(a && b && a.p === b.p && a.m === b.m)
      const pct = (x) => Math.round(Number(x) * 100)
      const player = (() => {
        const yt = document.getElementById('movie_player')
        if (yt && typeof yt.getVolume === 'function') {
          return {
            get: () => ({ p: Math.round(yt.getVolume()), m: Boolean(yt.isMuted()) }),
            set: (s) => { yt.setVolume(s.p); s.m ? yt.mute() : yt.unMute() }
          }
        }
        const twSlider = document.querySelector('input[data-a-target=player-volume-slider]')
        const twMute = document.querySelector('button[data-a-target=player-mute-unmute-button]')
        if (twSlider && twMute) {
          const get = () => ({ p: pct(twSlider.value), m: /^unmute/i.test(twMute.getAttribute('aria-label') || '') })
          return {
            get,
            set: (s) => {
              if (get().p !== s.p) {
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(twSlider, String(s.p / 100))
                twSlider.dispatchEvent(new Event('input', { bubbles: true }))
                twSlider.dispatchEvent(new Event('change', { bubbles: true }))
              }
              if (get().m !== s.m) twMute.click()
            }
          }
        }
        const area = (el) => el.clientWidth * el.clientHeight
        const main = [...document.querySelectorAll('video')].filter((el) => el.readyState > 0 && area(el) > 0).sort((a, b) => area(b) - area(a))[0]
        if (!main) return null
        const fromVideo = () => ({ p: pct(main.volume), m: main.muted })
        if (location.hostname === 'player.kick.com') {
          // The props of Kick's volume control component, found from its (unlabelled) control buttons.
          const kickControls = () => {
            for (const b of document.querySelectorAll('button')) {
              let f = b[Object.keys(b).find((k) => k.startsWith('__reactFiber')) || '']
              for (let i = 0; f && i < 12; i++, f = f.return) {
                const pr = f.memoizedProps
                if (pr && typeof pr.onVolumeChange === 'function' && typeof pr.onToggleMute === 'function' && 'isMuted' in pr) return pr
              }
            }
            return null
          }
          if (kickControls()) {
            return {
              get: fromVideo,
              set: (s) => {
                if (fromVideo().p !== s.p) kickControls().onVolumeChange([s.p]) // takes the slider's [0–100] value
                if (fromVideo().m !== s.m) kickControls().onToggleMute()
              }
            }
          }
        }
        return {
          get: fromVideo,
          fresh: !main.dataset.shVol,
          set: (s) => { main.volume = s.p / 100; main.muted = s.m; main.dataset.shVol = '1' }
        }
      })()
      if (!player) return null
      if (!same(window.__shApplied, want) || player.fresh) {
        player.set(want)
        window.__shApplied = want
        return null
      }
      const raw = player.get()
      const now = raw.m && raw.p === 0 ? { p: want.p, m: true } : raw
      if (same(now, want)) return null
      window.__shApplied = now
      return now
    })()`
    const tick = (): void => {
      ref.current
        ?.executeJavaScript(script)
        .then((r) => {
          const now = r as { p: number; m: boolean } | null
          if (now) volumeChangeRef.current?.(now.p / 100, now.m)
        })
        .catch(() => {})
    }
    tick()
    const timer = setInterval(tick, 500)
    return () => clearInterval(timer)
  }, [ready, volume, muted])

  return (
    <div className={`relative bg-black ${className ?? ''}`}>
      <webview
        // A partition can't change after attach, so remount when it does (e.g. toggling ad blocking).
        key={partition}
        ref={ref as unknown as React.Ref<HTMLWebViewElement>}
        src={src}
        partition={partition}
        httpreferrer="https://streamhub.app/"
        style={inPip ? { filter: 'grayscale(1) brightness(0.35)' } : undefined}
      />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-tertiary">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-control border-t-accent" />
        </div>
      )}
      {inPip && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-center">
          <PictureInPicture2Icon className="size-10 text-white/80" strokeWidth={1.5} />
          <div>
            <p className="text-strong text-white">Playing in Picture-in-Picture</p>
            <p className="mt-0.5 text-small text-white/60">Close the floating window to watch here again.</p>
          </div>
          <button
            type="button"
            onClick={() => void window.api.closePip()}
            className="mt-1 flex h-8 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-small-strong text-white ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-white/25"
          >
            Bring video back
          </button>
        </div>
      )}
    </div>
  )
}
