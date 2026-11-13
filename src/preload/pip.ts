import { ipcRenderer } from 'electron'

// Controls of the floating picture-in-picture player (main/pip.ts opens its window), drawn over
// whichever page plays the video: a Twitch/YouTube/Kick/Rumble player, or the app's own page for
// direct HLS videos. They live in a closed shadow root, so the page's styles and scripts can't reach
// them, and work the page's main <video> directly (marked data-sh-pip by main/pip.ts).
//
// Layout (like iOS's picture in picture): close and stash at the top left; speed, sound and back to
// the app at the top right; ±15s and play/pause in the middle; time and a scrubber along the bottom.
// Live streams have no speed, skip or scrubber, just a LIVE badge.

const SPEEDS = [1, 1.25, 1.5, 2, 0.5, 0.75]
const HIDE_AFTER_MS = 2500

type Shape = [tag: string, attrs: Record<string, string | number>]
const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Elements are built directly, never from HTML strings: some player pages (YouTube) enforce Trusted
 * Types, which blocks innerHTML even from here.
 */
function el(tag: string, attrs: Record<string, string> = {}, ...children: Array<Node | string>): HTMLElement {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  node.append(...children)
  return node
}

const icon = (shapes: Shape[], size = 18, fill = false) => (): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  const attrs = { width: size, height: size, viewBox: '0 0 24 24', fill: fill ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': fill ? 0 : 2.25, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, String(v))
  for (const [tag, a] of shapes) {
    const shape = document.createElementNS(SVG_NS, tag)
    for (const [k, v] of Object.entries(a)) shape.setAttribute(k, String(v))
    svg.append(shape)
  }
  return svg
}

const SPEAKER: Shape = ['path', { d: 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z' }]
const ICONS = {
  close: icon([['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]], 16),
  stash: icon([['path', { d: 'M5 12h14' }]], 16),
  play: icon([['path', { d: 'M7 4.5v15a1 1 0 0 0 1.52.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z' }]], 26, true),
  pause: icon([['rect', { x: 5.5, y: 4, width: 4.5, height: 16, rx: 1.4 }], ['rect', { x: 14, y: 4, width: 4.5, height: 16, rx: 1.4 }]], 26, true),
  back: icon([['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }], ['path', { d: 'M3 3v5h5' }]], 30),
  forward: icon([['path', { d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' }], ['path', { d: 'M21 3v5h-5' }]], 30),
  sound: icon([SPEAKER, ['path', { d: 'M16 9a5 5 0 0 1 0 6' }], ['path', { d: 'M19.364 18.364a9 9 0 0 0 0-12.728' }]], 16),
  muted: icon([SPEAKER, ['line', { x1: 22, x2: 16, y1: 9, y2: 15 }], ['line', { x1: 16, x2: 22, y1: 9, y2: 15 }]], 16),
  toApp: icon([['path', { d: 'M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4' }], ['rect', { width: 10, height: 7, x: 12, y: 13, rx: 2 }]], 16),
  left: icon([['path', { d: 'm15 18-6-6 6-6' }]], 18),
  right: icon([['path', { d: 'm9 18 6-6-6-6' }]], 18)
}

const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .root { position: fixed; inset: 0; font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
    color: #fff; user-select: none; -webkit-user-select: none; cursor: default; }
  .controls { position: absolute; inset: 0; transition: opacity .2s ease; }
  .controls.hidden { opacity: 0; pointer-events: none; }
  .shade { position: absolute; inset: 0; background: linear-gradient(rgba(0,0,0,.28), rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,.32)); pointer-events: none; }
  button { all: unset; display: flex; align-items: center; justify-content: center; color: #fff; cursor: default; }
  .glass { background: rgba(120,120,128,.42); -webkit-backdrop-filter: blur(18px) saturate(1.6); backdrop-filter: blur(18px) saturate(1.6);
    box-shadow: inset 0 0 0 .5px rgba(255,255,255,.22), 0 2px 10px rgba(0,0,0,.18); transition: background .15s ease, transform .1s ease; }
  .glass:hover { background: rgba(150,150,158,.52); }
  .glass:active { transform: scale(.94); }
  .circle { width: 32px; height: 32px; border-radius: 50%; }
  .bar { position: absolute; top: 10px; display: flex; gap: 8px; }
  .bar.left { left: 10px; } .bar.right { right: 10px; }
  .pill { height: 32px; min-width: 44px; padding: 0 12px; border-radius: 16px; font-size: 14px; font-variant-numeric: tabular-nums; }
  .center { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 22px; }
  .skip { position: relative; width: 44px; height: 44px; border-radius: 50%; }
  .skip span { position: absolute; font-size: 9.5px; font-weight: 700; top: 50%; left: 50%; transform: translate(-50%, -38%); }
  .main { width: 60px; height: 60px; border-radius: 50%; }
  .bottom { position: absolute; left: 10px; right: 10px; bottom: 10px; height: 30px; border-radius: 15px; display: flex; align-items: center; gap: 10px; padding: 0 12px; }
  .time { font-size: 12px; font-variant-numeric: tabular-nums; min-width: 30px; text-align: center; opacity: .95; }
  .track { position: relative; flex: 1; height: 18px; display: flex; align-items: center; }
  .track::before { content: ""; position: absolute; left: 0; right: 0; height: 4px; border-radius: 2px; background: rgba(255,255,255,.28); }
  .fill { position: absolute; left: 0; height: 4px; border-radius: 2px; background: rgba(255,255,255,.92); }
  .track:hover::before, .track:hover .fill { height: 6px; border-radius: 3px; }
  .live { display: flex; align-items: center; gap: 6px; font-size: 12px; letter-spacing: .04em; }
  .live::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #ff3b30; }
  .bottom.live-only { right: auto; padding: 0 12px; }
  .tab { position: absolute; top: 0; bottom: 0; width: 36px; display: none; align-items: center; justify-content: center; background: rgba(30,30,32,.72);
    -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px); }
  .stashed .tab { display: flex; }
  .stashed .controls { display: none; }
  .tab.at-left { left: 0; } .tab.at-right { right: 0; }
  .narrow .skip { display: none; }
  .narrow .center { gap: 0; }
`

const clock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const area = (v: HTMLVideoElement): number => v.clientWidth * v.clientHeight

/** The page's main video: the one main/pip.ts marked, else (if the player swapped it out) the largest playing one. */
function mainVideo(): HTMLVideoElement | null {
  const marked = document.querySelector<HTMLVideoElement>('video[data-sh-pip]')
  if (marked) return marked
  const next = [...document.querySelectorAll('video')].filter((v) => v.readyState >= 2 && v.videoWidth > 0).sort((a, b) => area(b) - area(a))[0]
  if (next) next.dataset.shPip = '1'
  return next ?? null
}

function mount(info: { live: boolean }): void {
  const host = document.createElement('div')
  // Lets clicks through to the page until its video plays: main/pip.ts may need to click the page's
  // own play overlay (Rumble) to start it.
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;visibility:visible;display:block;pointer-events:none'
  const shadow = host.attachShadow({ mode: 'closed' })
  const button = (cls: string, act: string, title: string, ...children: Array<Node | string>): HTMLElement => el('button', { class: cls, 'data-act': act, title }, ...children)
  const timeEl = (name: string): HTMLElement => el('span', { class: 'time', 'data-el': name }, '0:00')
  const skip = (act: string, title: string, glyph: () => SVGSVGElement): HTMLElement => button('glass skip', act, title, glyph(), el('span', {}, '15'))
  shadow.append(
    el('style', {}, CSS),
    el(
      'div',
      { class: 'root' },
      el(
        'div',
        { class: 'controls' },
        el('div', { class: 'shade' }),
        el('div', { class: 'bar left' }, button('glass circle', 'close', 'Close', ICONS.close()), button('glass circle', 'stash', 'Move to the side of the screen', ICONS.stash())),
        el(
          'div',
          { class: 'bar right' },
          button('glass pill', 'speed', 'Playback speed', '1×'),
          button('glass circle', 'sound', 'Mute', ICONS.sound()),
          button('glass circle', 'app', 'Back to StreamHub', ICONS.toApp())
        ),
        el('div', { class: 'center' }, skip('back', 'Back 15 seconds', ICONS.back), button('glass main', 'play', 'Pause', ICONS.pause()), skip('forward', 'Forward 15 seconds', ICONS.forward)),
        el(
          'div',
          { class: 'glass bottom' },
          timeEl('now'),
          el('div', { class: 'track', 'data-el': 'track' }, el('div', { class: 'fill', 'data-el': 'fill' })),
          timeEl('total'),
          el('span', { class: 'live', 'data-el': 'live' }, 'LIVE')
        )
      ),
      button('tab', 'unstash', 'Show the player')
    )
  )
  const $ = <T extends HTMLElement>(sel: string): T => shadow.querySelector<T>(sel)!
  const root = $<HTMLDivElement>('.root')
  const controls = $<HTMLDivElement>('.controls')
  const playBtn = $<HTMLButtonElement>('[data-act="play"]')
  const speedBtn = $<HTMLButtonElement>('[data-act="speed"]')
  const soundBtn = $<HTMLButtonElement>('[data-act="sound"]')
  const tab = $<HTMLButtonElement>('.tab')
  const bottom = $<HTMLDivElement>('.bottom')
  const [now, total, track, fill, liveBadge] = ['now', 'total', 'track', 'fill', 'live'].map((k) => $(`[data-el="${k}"]`))
  const skips = [...shadow.querySelectorAll<HTMLElement>('.skip')]

  const isLive = (v: HTMLVideoElement | null): boolean => info.live || !v || !Number.isFinite(v.duration) || v.duration <= 0

  // ---------- Showing and hiding ----------
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let hovering = false
  let scrubbing = false
  const show = (): void => {
    controls.classList.remove('hidden')
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      const v = mainVideo()
      if (v && !v.paused && !scrubbing) controls.classList.add('hidden')
    }, HIDE_AFTER_MS)
  }
  root.addEventListener('pointermove', show)
  root.addEventListener('pointerenter', () => {
    hovering = true
    show()
  })
  root.addEventListener('pointerleave', () => {
    hovering = false
    const v = mainVideo()
    if (v && !v.paused && !scrubbing) controls.classList.add('hidden')
  })

  // ---------- Buttons ----------
  const act: Record<string, (v: HTMLVideoElement) => void> = {
    close: () => ipcRenderer.send('pip-close'),
    app: () => ipcRenderer.send('pip-back'),
    stash: () => ipcRenderer.send('pip-stash'),
    unstash: () => ipcRenderer.send('pip-stash'),
    play: (v) => {
      if (v.paused) {
        delete v.dataset.shUserPaused
        v.play().catch(() => {})
      } else {
        // The keep-playing guard (main/pip.ts) leaves a video alone once you've paused it.
        v.dataset.shUserPaused = '1'
        v.pause()
      }
    },
    back: (v) => {
      v.currentTime = Math.max(0, v.currentTime - 15)
    },
    forward: (v) => {
      v.currentTime = Math.min(v.duration - 0.5, v.currentTime + 15)
    },
    sound: (v) => {
      v.muted = !v.muted
      if (!v.muted && v.volume === 0) v.volume = 1
    },
    speed: (v) => {
      v.playbackRate = SPEEDS[(SPEEDS.indexOf(v.playbackRate) + 1) % SPEEDS.length] ?? 1
    }
  }
  shadow.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
    const v = mainVideo()
    const fn = btn && act[btn.dataset.act!]
    if (!fn) return
    e.stopPropagation()
    if (v || btn.dataset.act === 'close' || btn.dataset.act === 'app' || btn.dataset.act?.includes('stash')) fn(v!)
    render()
    show()
  })

  // ---------- Scrubber ----------
  const seekTo = (e: PointerEvent): void => {
    const v = mainVideo()
    if (!v || isLive(v)) return
    const r = track.getBoundingClientRect()
    v.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * v.duration
    render()
  }
  track.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    scrubbing = true
    track.setPointerCapture(e.pointerId)
    seekTo(e)
  })
  track.addEventListener('pointermove', (e) => scrubbing && seekTo(e))
  track.addEventListener('pointerup', () => {
    scrubbing = false
    show()
  })

  // ---------- Moving the window (anywhere that isn't a control) ----------
  let drag: { x: number; y: number; id: number } | null = null
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, .track')) return
    drag = { x: e.screenX, y: e.screenY, id: e.pointerId }
    root.setPointerCapture(e.pointerId)
    ipcRenderer.send('pip-drag-start')
  })
  root.addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.id) ipcRenderer.send('pip-drag', e.screenX - drag.x, e.screenY - drag.y)
  })
  const endDrag = (): void => {
    if (drag) ipcRenderer.send('pip-drag-end')
    drag = null
  }
  root.addEventListener('pointerup', endDrag)
  root.addEventListener('pointercancel', endDrag)
  root.addEventListener('dblclick', (e) => {
    if (!(e.target as HTMLElement).closest('button, .track')) ipcRenderer.send('pip-back')
  })

  // ---------- Stashed at the side of the screen ----------
  ipcRenderer.on('pip-stashed', (_, side: 'left' | 'right' | null) => {
    root.classList.toggle('stashed', Boolean(side))
    // The part still on screen is the side facing the middle; its arrow points back out.
    tab.classList.toggle('at-left', side === 'right')
    tab.classList.toggle('at-right', side === 'left')
    tab.replaceChildren(side === 'right' ? ICONS.left() : ICONS.right())
  })

  // ---------- Keeping the controls in step with the video ----------
  const render = (): void => {
    const v = mainVideo()
    if (!v) return
    host.style.pointerEvents = ''
    const live = isLive(v)
    // Icons swap only when the state changes (render runs four times a second).
    const playing = v.paused ? 'play' : 'pause'
    if (playBtn.dataset.icon !== playing) {
      playBtn.dataset.icon = playing
      playBtn.replaceChildren(ICONS[playing]())
      playBtn.title = v.paused ? 'Play' : 'Pause'
    }
    const sound = v.muted || v.volume === 0 ? 'muted' : 'sound'
    if (soundBtn.dataset.icon !== sound) {
      soundBtn.dataset.icon = sound
      soundBtn.replaceChildren(ICONS[sound]())
      soundBtn.title = sound === 'muted' ? 'Unmute' : 'Mute'
    }
    speedBtn.textContent = `${v.playbackRate}×`
    speedBtn.style.display = live ? 'none' : ''
    for (const s of skips) s.style.visibility = live ? 'hidden' : ''
    for (const el of [now, total, track]) el.style.display = live ? 'none' : ''
    liveBadge.style.display = live ? '' : 'none'
    bottom.classList.toggle('live-only', live)
    if (!live) {
      now.textContent = clock(v.currentTime)
      total.textContent = clock(v.duration)
      fill.style.width = `${Math.min(100, (v.currentTime / v.duration) * 100)}%`
    }
    root.classList.toggle('narrow', innerWidth < 300)
    if (v.paused || hovering) controls.classList.remove('hidden')
  }
  setInterval(() => {
    // Pages that rebuild their document (single-page players) can drop the overlay; put it back.
    if (!host.isConnected) document.documentElement.append(host)
    render()
  }, 250)
  document.documentElement.append(host)
  show()
}

function start(): void {
  void ipcRenderer.invoke('pip-info').then((info: { live: boolean } | null) => {
    if (info) mount(info)
  })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
else start()
