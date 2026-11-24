// ── Geometry (each mascot in a 100×100 box) ───────────────────────────────────────────────
const pill = (x, y, w, h) => `M${x} ${y + w / 2} a${w / 2} ${w / 2} 0 0 1 ${w} 0 v${h - w} a${w / 2} ${w / 2} 0 0 1 ${-w} 0 Z`
const hpill = (x, y, w, h) => `M${x + h / 2} ${y} h${w - h} a${h / 2} ${h / 2} 0 0 1 0 ${h} h${-(w - h)} a${h / 2} ${h / 2} 0 0 1 0 ${-h} Z`
const ell = (cx, cy, rx, ry = rx) => `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`
const rrect = (x, y, w, h, r) => `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`
function roundedPoly(pts, r) {
  const n = pts.length, at = (p, q, d) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy); return [p[0] + dx * d / l, p[1] + dy * d / l] }
  let d = ''
  for (let i = 0; i < n; i++) {
    const p = pts[i], prev = pts[(i + n - 1) % n], next = pts[(i + 1) % n]
    const a = at(p, prev, r), b = at(p, next, r)
    d += `${i ? 'L' : 'M'}${a[0].toFixed(2)} ${a[1].toFixed(2)} Q${p[0]} ${p[1]} ${b[0].toFixed(2)} ${b[1].toFixed(2)} `
  }
  return d + 'Z'
}

// Layers in drawing order. role = which colour; stroke = drawn as a line of that width.
const APPS = [
  {
    id: 'streamhub', name: 'StreamHub', blurb: 'The glowing chat bubble with its pause bars.', layers: [
      { role: 'main', d: 'M40.6 71.5 A27 27 0 1 0 28.6 60.5 Q26 72 21 80 Q32 78 40.6 71.5 Z' },
      { role: 'detail', d: pill(43, 37, 6, 20) },
      { role: 'detail', d: pill(55, 37, 6, 20) }
    ]
  },
  {
    id: 'apollo', name: 'Apollo Delta', blurb: 'The delta robot with its visor, antenna and ring.', shift: 4,
    layers: [
      { role: 'ring', d: 'M10.9 70.3 A40 10 -12 0 1 89.1 53.7', stroke: 3.2 },
      { role: 'main', d: 'M50 28 L50 15', stroke: 2.6 },
      { role: 'ring', d: ell(50, 12, 4.4) },
      { role: 'main', d: roundedPoly([[50, 24], [80, 74], [20, 74]], 10) },
      { role: 'detail', d: 'M37 50 Q50 44 63 50 Q66 58 60 63 Q50 66.5 40 63 Q34 58 37 50 Z' },
      { role: 'eyes', d: ell(44.5, 55.5, 3.2, 4) },
      { role: 'eyes', d: ell(55.5, 55.5, 3.2, 4) },
      { role: 'ring', d: 'M89.1 53.7 A40 10 -12 0 1 10.9 70.3', stroke: 3.6 }
    ]
  },
  {
    id: 'watchlist', name: 'WatchList', blurb: 'The monitor with its list, check mark and bookmark.', shift: 2,
    layers: [
      { role: 'main', d: rrect(19, 26, 62, 42.5, 7) },
      { role: 'main', d: rrect(47, 67, 6, 6.5, 1) },
      { role: 'main', d: hpill(37.3, 72.3, 25.4, 4.5) },
      { role: 'detail', d: hpill(27.5, 33.6, 28.3, 4.5) },
      { role: 'detail', d: hpill(27.5, 42.4, 22.7, 4.5) },
      { role: 'detail', d: hpill(27.5, 51.2, 17.2, 4.5) },
      { role: 'detail', d: ell(64.5, 51.8, 7.8) },
      { role: 'main', d: 'M60.9 52 L63.7 54.7 L68.4 49.2', stroke: 2.7 },
      { role: 'gap', d: 'M62.5 19 H72.7 V37 L67.6 33.4 L62.5 37 Z', stroke: 3.4 },
      { role: 'ring', d: 'M62.5 19 H72.7 V37 L67.6 33.4 L62.5 37 Z' }
    ]
  }
]

// ── Palettes: per style, per app (roles main / detail / ring / eyes / gap, plus backgrounds) ─
const P = {
  pixel: {
    streamhub: { bg: ['#1d2b53', '#16203f', '#0f1630'], main: '#29adff', shade: '#1d64c7', light: '#a8e4ff', detail: '#fff1e8', outline: '#05070f' },
    apollo: { bg: ['#7e2553', '#5a1d4a', '#3b1240'], main: '#fff1e8', shade: '#c2c3c7', light: '#ffffff', detail: '#1d2b53', eyes: '#29adff', ring: '#ffec27', outline: '#120617' },
    watchlist: { bg: ['#ff004d', '#c4103e', '#8a0c2f'], main: '#fff1e8', shade: '#c2c3c7', light: '#ffffff', detail: '#ff77a8', ring: '#ffa300', gap: '#7e2553', outline: '#2a0614' }
  },
  watercolor: {
    streamhub: { paper: '#f6efe2', wash: '#9cc6ef', main: '#2f6fd6', detail: '#fdf6e6', edge: '#173f8a' },
    apollo: { paper: '#f7efe1', wash: '#c3b7f2', main: '#ffffff', detail: '#2d2f6e', eyes: '#45b8d8', ring: '#e8a93b', edge: '#5b5fa8' },
    watchlist: { paper: '#f8efe4', wash: '#f3a8ae', main: '#e0475a', detail: '#fdf3e6', ring: '#f2b33d', gap: '#f8efe4', edge: '#8e1f30' }
  },
  oil: {
    streamhub: { bg: ['#203050', '#3d2a52'], main: '#3f7ff0', detail: '#f4e2b1' },
    apollo: { bg: ['#2f6f73', '#1f3c5a'], main: '#f1e6cf', detail: '#2a2140', eyes: '#7fd3e0', ring: '#e0a32e' },
    watchlist: { bg: ['#7a1e2c', '#3e1220'], main: '#f3e3c8', detail: '#b8323f', ring: '#e2a23a', gap: '#5a1622' }
  },
  neon: {
    streamhub: { wall: '#17121c', brick: '#241b2a', main: '#2ee6ff', detail: '#ff4fd8' },
    apollo: { wall: '#12141c', brick: '#1d2130', main: '#5cf2ff', detail: '#ff5ce1', eyes: '#ff5ce1', ring: '#ffe45c' },
    watchlist: { wall: '#1a1214', brick: '#2a1a1e', main: '#ff4d6d', detail: '#ffd23f', ring: '#3df5c4', gap: '#1a1214' }
  },
  paper: {
    streamhub: { bg: '#ff8a5b', back: '#ffd6a5', main: '#2b59c3', detail: '#fff4e0' },
    apollo: { bg: '#7fc8a9', back: '#fff1c1', main: '#fffaf0', detail: '#264653', eyes: '#f4a261', ring: '#e76f51' },
    watchlist: { bg: '#2a9d8f', back: '#f4e1c1', main: '#fffaf0', detail: '#e63946', ring: '#f4a261', gap: '#2a9d8f' }
  },
  blueprint: {
    streamhub: { bg: '#164a8a', ink: '#e8f1ff' }, apollo: { bg: '#123f7a', ink: '#e8f1ff' }, watchlist: { bg: '#18467f', ink: '#e8f1ff' }
  },
  glass: {
    streamhub: { panes: ['#7a1f3d', '#1f5f7a', '#2d7a4a', '#5a2d82', '#b8641f', '#1f3f7a'], main: '#2a6fdb', detail: '#f6d365' },
    apollo: { panes: ['#3c1f7a', '#1f6a7a', '#7a1f5a', '#2a3f8a', '#1f7a4a', '#5a1f82'], main: '#efe6c8', detail: '#1b2a6b', eyes: '#5fe3ff', ring: '#e3a72f' },
    watchlist: { panes: ['#8a1f2d', '#b8641f', '#5a1f3d', '#a83a1f', '#7a1f5a', '#1f4f7a'], main: '#f2ead6', detail: '#c42d3f', ring: '#e3a72f', gap: '#1c1712' }
  },
  synth: {
    streamhub: { detail: '#2b1055' }, apollo: { detail: '#1a0b3d', eyes: '#3df5ff', ring: '#ff9a3d' }, watchlist: { detail: '#ff3f8e', ring: '#3df5ff', gap: '#2b1055' }
  }
}

const STYLES = [
  { id: 'pixel', name: 'Pixel Art', note: 'A 32×32 sprite with a hard outline and two-tone shading, like a 16-bit game.' },
  { id: 'watercolor', name: 'Watercolour', note: 'Soft washes that bleed at the edges, on textured paper.' },
  { id: 'oil', name: 'Oil Paint', note: 'Thick brushstrokes you can see, lit from the top left.' },
  { id: 'neon', name: 'Neon Sign', note: 'Glowing tubes mounted on a dark brick wall.' },
  { id: 'paper', name: 'Paper Cut-Out', note: 'Layers of cut card stacked with soft shadows.' },
  { id: 'blueprint', name: 'Blueprint', note: 'A technical drawing with a grid, construction lines and measurements.' },
  { id: 'glass', name: 'Stained Glass', note: 'Jewel-toned panes held together by dark lead lines.' },
  { id: 'synth', name: 'Synthwave', note: 'Chrome over an 80s sunset and a neon grid horizon.' }
]

// ── Rendering ─────────────────────────────────────────────────────────────────────────────
let uid = 0
const svgOpen = (inner, defs = '') => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img"><defs>${defs}</defs>${inner}</svg>`
const shapes = (app, fn) => app.layers.map((l, i) => fn(l, i)).join('')
const art = (app, inner) => `<g transform="translate(0 ${app.shift || 0})">${inner}</g>`
const lineAttrs = (w) => `fill="none" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`

function pixel(app, pal) {
  const N = 32, cv = document.createElement('canvas'), ctx = cv.getContext('2d')
  const grid = Array.from({ length: N }, () => Array(N).fill(null))
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = (x + 0.5) * 100 / N, py = (y + 0.5) * 100 / N - (app.shift || 0)
    for (const l of app.layers) {
      const p = new Path2D(l.d)
      let hit
      if (l.stroke) { ctx.lineWidth = Math.max(l.stroke, 2.4); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; hit = ctx.isPointInStroke(p, px, py) }
      else hit = ctx.isPointInPath(p, px, py)
      if (hit) grid[y][x] = l.role
    }
  }
  const filled = (x, y) => x >= 0 && y >= 0 && x < N && y < N && grid[y][x] && grid[y][x] !== 'gap'
  let r = ''
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let c
    const role = grid[y][x]
    if (!filled(x, y)) {
      const near = filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1)
      c = near ? pal.outline : pal.bg[Math.min(2, Math.floor((y + ((x + y) % 2)) / 11))]
    } else if (role === 'main') {
      c = !filled(x, y + 1) || !filled(x + 1, y) ? pal.shade : !filled(x, y - 1) || !filled(x - 1, y) ? pal.light : pal.main
    } else c = pal[role] || pal.main
    r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c}"/>`
  }
  return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" role="img" shape-rendering="crispEdges">${r}</svg>`
}

function watercolor(app, pal) {
  const id = 'w' + uid++
  const defs = `
    <filter id="${id}b" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="${uid}"/><feDisplacementMap in="SourceGraphic" scale="6" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="0.45"/></filter>
    <filter id="${id}s" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="${uid + 3}"/><feDisplacementMap in="SourceGraphic" scale="14" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="2.2"/></filter>
    <filter id="${id}p"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.3  0 0 0 0.22 0"/></filter>`
  const body = shapes(app, (l) => {
    const c = pal[l.role] || pal.main
    if (l.stroke) return `<path d="${l.d}" stroke="${c}" ${lineAttrs(l.stroke)} opacity="0.9" filter="url(#${id}b)"/>`
    return `<g filter="url(#${id}b)"><path d="${l.d}" fill="${c}" opacity="${l.role === 'main' ? 0.82 : 0.9}"/><path d="${l.d}" fill="none" stroke="${pal.edge}" stroke-width="0.9" opacity="0.35"/></g>`
  })
  return svgOpen(`<rect width="100" height="100" fill="${pal.paper}"/><circle cx="52" cy="50" r="38" fill="${pal.wash}" opacity="0.55" filter="url(#${id}s)"/>${art(app, body)}<rect width="100" height="100" filter="url(#${id}p)"/>`, defs)
}

function oil(app, pal) {
  const id = 'o' + uid++
  const defs = `
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pal.bg[0]}"/><stop offset="1" stop-color="${pal.bg[1]}"/></linearGradient>
    <filter id="${id}w"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="${uid}"/><feDisplacementMap in="SourceGraphic" scale="3.2" xChannelSelector="R" yChannelSelector="G"/></filter>
    <filter id="${id}t" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency="0.11 0.028" numOctaves="3" seed="${uid + 11}" result="t"/><feDiffuseLighting in="t" surfaceScale="2.4" lighting-color="#ffffff" result="l"><feDistantLight azimuth="225" elevation="48"/></feDiffuseLighting><feComposite in="l" in2="SourceGraphic" operator="arithmetic" k1="1.25" k2="0" k3="0" k4="0" result="m"/><feComposite in="m" in2="SourceGraphic" operator="in"/></filter>`
  const body = shapes(app, (l) => {
    const c = pal[l.role] || pal.main
    return l.stroke ? `<path d="${l.d}" stroke="${c}" ${lineAttrs(l.stroke + 0.6)}/>` : `<path d="${l.d}" fill="${c}" stroke="${c}" stroke-width="0.8" stroke-linejoin="round"/>`
  })
  return svgOpen(`<g filter="url(#${id}t)"><rect width="100" height="100" fill="url(#${id}g)"/><g filter="url(#${id}w)">${art(app, body)}</g></g>`, defs)
}

function neon(app, pal) {
  const id = 'n' + uid++
  let bricks = ''
  for (let row = 0; row < 12; row++) for (let col = -1; col < 6; col++) bricks += `<rect x="${col * 20 + (row % 2) * 10 + 0.6}" y="${row * 9 + 0.6}" width="18.8" height="7.8" rx="0.8" fill="${pal.brick}"/>`
  const defs = `<filter id="${id}g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur in="SourceGraphic" stdDeviation="1.3" result="a"/><feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="a"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <radialGradient id="${id}r" cx="0.5" cy="0.5" r="0.6"><stop offset="0" stop-color="#ffffff" stop-opacity="0.08"/><stop offset="1" stop-color="#000000" stop-opacity="0.45"/></radialGradient>`
  const small = (l) => /a[\d.]+ [\d.]+ 0 1 0/.test(l.d) && l.d.length < 60
  const tubes = shapes(app, (l) => {
    if (l.role === 'gap') return ''
    const c = pal[l.role] || pal.main
    if (small(l) && l.role !== 'detail') return `<path d="${l.d}" fill="${c}"/>`
    const w = l.stroke ? Math.min(l.stroke, 2.4) : 2
    return `<path d="${l.d}" stroke="${c}" ${lineAttrs(w)}/><path d="${l.d}" stroke="#ffffff" ${lineAttrs(w * 0.32)} opacity="0.85"/>`
  })
  return svgOpen(`<rect width="100" height="100" fill="${pal.wall}"/>${bricks}<rect width="100" height="100" fill="url(#${id}r)"/><g filter="url(#${id}g)">${art(app, `<g transform="translate(50 50) scale(0.86) translate(-50 -50)">${tubes}</g>`)}</g>`, defs)
}

function paper(app, pal) {
  const id = 'p' + uid++
  const defs = `<filter id="${id}d" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0.4" dy="1.4" stdDeviation="1.1" flood-color="#000" flood-opacity="0.32"/></filter>
    <filter id="${id}n"><feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="4"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.16 0"/></filter>`
  const backing = app.layers.filter((l) => l.role === 'main' && !l.stroke).map((l) => `<path d="${l.d}" fill="${pal.back}" stroke="${pal.back}" stroke-width="7" stroke-linejoin="round"/>`).join('')
  const body = shapes(app, (l) => {
    const c = pal[l.role] || pal.main
    return l.stroke ? `<path d="${l.d}" stroke="${c}" ${lineAttrs(l.stroke)} filter="url(#${id}d)"/>` : `<path d="${l.d}" fill="${c}" filter="url(#${id}d)"/>`
  })
  return svgOpen(`<rect width="100" height="100" fill="${pal.bg}"/><circle cx="50" cy="50" r="42" fill="#ffffff" opacity="0.12"/>${art(app, `<g filter="url(#${id}d)">${backing}</g>${body}`)}<rect width="100" height="100" filter="url(#${id}n)"/>`, defs)
}

function blueprint(app, pal) {
  const id = 'b' + uid++
  const defs = `<pattern id="${id}s" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="${pal.ink}" stroke-width="0.15" opacity="0.35"/></pattern>
    <pattern id="${id}l" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="${pal.ink}" stroke-width="0.3" opacity="0.4"/></pattern>`
  const body = shapes(app, (l) => (l.role === 'gap' ? '' : `<path d="${l.d}" stroke="${pal.ink}" ${lineAttrs(0.9)}/>`))
  const t = (x, y, s, anchor = 'start') => `<text x="${x}" y="${y}" fill="${pal.ink}" font-family="JetBrains Mono, Menlo, monospace" font-size="3.4" text-anchor="${anchor}" opacity="0.9">${s}</text>`
  const notes = {
    streamhub: `<circle cx="52" cy="47" r="1" fill="${pal.ink}"/><path d="M52 47 L71.1 27.9" stroke="${pal.ink}" stroke-width="0.4" stroke-dasharray="1.2 1"/>${t(66, 25, 'R27')}<path d="M43 61 V64 M61 61 V64 M43 63 H61" stroke="${pal.ink}" stroke-width="0.35"/>${t(52, 67.5, '18', 'middle')}`,
    apollo: `<path d="M50 20 V82 M8 62 H92" stroke="${pal.ink}" stroke-width="0.3" stroke-dasharray="2 1.2" opacity="0.7"/>${t(91, 52, '12°', 'end')}${t(24, 27, 'Δ 60')}`,
    watchlist: `<path d="M19 22 V18 M81 22 V18 M19 20 H59" stroke="${pal.ink}" stroke-width="0.35"/>${t(38, 18.5, '62', 'middle')}<path d="M86 26 V68.5 M84 26 H88 M84 68.5 H88" stroke="${pal.ink}" stroke-width="0.35"/>${t(90.5, 48, '42.5', 'middle').replace('<text', '<text transform="rotate(90 90.5 48)"')}`
  }[app.id]
  return svgOpen(`<rect width="100" height="100" fill="${pal.bg}"/><rect width="100" height="100" fill="url(#${id}s)"/><rect width="100" height="100" fill="url(#${id}l)"/>${art(app, body + notes)}${t(14, 91, 'REV B')}${t(86, 91, app.name.toUpperCase(), 'end')}`, defs)
}

function glass(app, pal) {
  const id = 'g' + uid++
  // A jittered grid of panes behind the mascot.
  const n = 5, pts = []
  let seed = app.id.length * 97
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  for (let j = 0; j <= n; j++) { pts.push([]); for (let i = 0; i <= n; i++) { const edge = i === 0 || j === 0 || i === n || j === n; pts[j].push([i * 20 + (edge ? 0 : (rnd() - 0.5) * 9), j * 20 + (edge ? 0 : (rnd() - 0.5) * 9)]) } }
  let panes = '', k = 0
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = pts[j][i], b = pts[j][i + 1], c = pts[j + 1][i + 1], d = pts[j + 1][i]
    const tri = (p, q, r) => `<path d="M${p} L${q} L${r} Z" fill="${pal.panes[(k++ * 7 + i + j) % pal.panes.length]}" stroke="#1c1712" stroke-width="1.3" stroke-linejoin="round"/>`
    panes += (i + j) % 2 ? tri(a, b, c) + tri(a, c, d) : tri(a, b, d) + tri(b, c, d)
  }
  const defs = `<radialGradient id="${id}l" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="0.6" stop-color="#ffffff" stop-opacity="0.05"/><stop offset="1" stop-color="#000000" stop-opacity="0.3"/></radialGradient>
    <filter id="${id}m"><feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="2" seed="2"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.12 0"/></filter>`
  const body = shapes(app, (l) => {
    const c = pal[l.role] || pal.main
    if (l.stroke) return `<path d="${l.d}" stroke="#1c1712" ${lineAttrs(l.stroke + 2)}/><path d="${l.d}" stroke="${c}" ${lineAttrs(l.stroke)}/>`
    return `<path d="${l.d}" fill="${c}" stroke="#1c1712" stroke-width="1.8" stroke-linejoin="round"/>`
  })
  return svgOpen(`${panes}${art(app, body)}<rect width="100" height="100" filter="url(#${id}m)"/><rect width="100" height="100" fill="url(#${id}l)"/>`, defs)
}

function synth(app, pal) {
  const id = 's' + uid++
  let grid = ''
  for (let i = 0; i < 7; i++) { const y = 70 + Math.pow(i / 6, 1.8) * 30; grid += `<path d="M0 ${y.toFixed(2)} H100" stroke="#ff3fd2" stroke-width="${0.35 + i * 0.12}" opacity="0.85"/>` }
  for (let i = -6; i <= 6; i++) grid += `<path d="M50 70 L${50 + i * 22} 100" stroke="#ff3fd2" stroke-width="0.45" opacity="0.85"/>`
  let stripes = ''
  for (let i = 0; i < 5; i++) stripes += `<rect x="0" y="${52 + i * 3.6}" width="100" height="${0.7 + i * 0.45}" fill="#000"/>`
  const defs = `<linearGradient id="${id}k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140630"/><stop offset="0.45" stop-color="#5b1676"/><stop offset="0.7" stop-color="#ff5f8f"/></linearGradient>
    <linearGradient id="${id}u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe36b"/><stop offset="1" stop-color="#ff3f8e"/></linearGradient>
    <mask id="${id}m"><rect width="100" height="100" fill="#fff"/>${stripes}</mask>
    <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#a9dcff"/><stop offset="0.5" stop-color="#3a2f7a"/><stop offset="0.62" stop-color="#8a6fd6"/><stop offset="1" stop-color="#ffd0f2"/></linearGradient>
    <filter id="${id}g" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="1.6" flood-color="#ff3fd2" flood-opacity="0.9"/></filter>`
  const body = shapes(app, (l) => {
    const c = l.role === 'main' ? `url(#${id}c)` : pal[l.role] || `url(#${id}c)`
    return l.stroke ? `<path d="${l.d}" stroke="${c}" ${lineAttrs(l.stroke)}/>` : `<path d="${l.d}" fill="${c}" stroke="${l.role === 'main' ? '#ff6fe0' : 'none'}" stroke-width="0.7"/>`
  })
  return svgOpen(`<rect width="100" height="100" fill="url(#${id}k)"/><circle cx="50" cy="56" r="27" fill="url(#${id}u)" mask="url(#${id}m)"/><rect y="70" width="100" height="30" fill="#14052a"/>${grid}<g filter="url(#${id}g)"><g transform="translate(50 45) scale(0.82) translate(-50 -50)">${art(app, body)}</g></g>`, defs)
}

const RENDER = { pixel, watercolor, oil, neon, paper, blueprint, glass, synth }

// ── Recolours: each app's own icon, redrawn in new colours ────────────────────────────────
function classicSH(c, extra = {}) {
  const id = 'c' + uid++
  // flat: the recolours. No halo behind the bubble and no glow on the bars, only a soft shadow.
  const flat = Boolean(extra.flat)
  const defs = `<linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg1}"/><stop offset="1" stop-color="${c.bg2}"/></linearGradient>
    <radialGradient id="${id}gl" cx="0.52" cy="0.47" r="0.5"><stop offset="0" stop-color="${c.glow}" stop-opacity="0.55"/><stop offset="1" stop-color="${c.glow}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}b" cx="0.42" cy="0.3" r="0.85"><stop offset="0" stop-color="${c.hi}"/><stop offset="0.45" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.deep}"/></radialGradient>
    <linearGradient id="${id}bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.bar1}"/><stop offset="1" stop-color="${c.bar2}"/></linearGradient>
    <filter id="${id}f" x="-30%" y="-30%" width="160%" height="160%">${flat ? `<feDropShadow dx="0" dy="1.2" stdDeviation="1.4" flood-color="#000" flood-opacity="0.35"/>` : `<feDropShadow dx="0" dy="0" stdDeviation="2.6" flood-color="${c.glow}" flood-opacity="0.85"/>`}</filter>
    <filter id="${id}fb" x="-60%" y="-30%" width="220%" height="160%">${flat ? `<feOffset dx="0" dy="0"/>` : `<feDropShadow dx="0" dy="0" stdDeviation="1.4" flood-color="${c.bar2}" flood-opacity="0.9"/>`}</filter>${extra.defs || ''}`
  const bubble = APPS[0].layers[0].d
  const bubbleArt = `<path d="${bubble}" fill="url(#${id}b)" stroke="${c.rim}" stroke-width="0.9" stroke-opacity="0.85" filter="url(#${id}f)"/>
    <ellipse cx="49" cy="31" rx="15" ry="6" fill="#ffffff" opacity="0.16"/>`
  const bars = `<g filter="url(#${id}fb)"><path d="${pill(43, 37, 6, 20)}" fill="url(#${id}bar)"/><path d="${pill(55, 37, 6, 20)}" fill="url(#${id}bar)"/></g>`
  return svgOpen(`<rect width="100" height="100" fill="url(#${id}bg)"/>${flat ? '' : `<rect width="100" height="100" fill="url(#${id}gl)"/>`}${extra.back || ''}${extra.replace ? extra.replace(id) : bubbleArt + bars}${extra.front || ''}`, defs)
}


function classicWL(c) {
  const id = 'l' + uid++
  const defs = `<linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg[0]}"/><stop offset="0.55" stop-color="${c.bg[1]}"/><stop offset="1" stop-color="${c.bg[2]}"/></linearGradient>
    <radialGradient id="${id}gl" cx="0.3" cy="0.18" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <mask id="${id}m"><rect width="100" height="100" fill="#fff"/>
      <path d="${hpill(27.54, 33.59, 28.32, 4.49)}" fill="#000"/><path d="${hpill(27.54, 42.38, 22.66, 4.49)}" fill="#000"/><path d="${hpill(27.54, 51.17, 17.19, 4.49)}" fill="#000"/>
      <circle cx="64.45" cy="51.76" r="7.81" fill="#000"/>
      <path d="M62.5 19.14 H72.66 V36.91 L67.58 33.4 L62.5 36.91 Z" fill="#000" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/></mask>`
  const g = `<g fill="${c.fg}"><g mask="url(#${id}m)"><path d="${rrect(19.14, 25.78, 61.72, 42.58, 7)}"/><path d="${rrect(47.07, 67.38, 5.86, 6.05, 1)}"/><path d="${hpill(37.3, 72.27, 25.39, 4.49)}"/></g>
    <path d="M62.5 19.14 H72.66 V36.91 L67.58 33.4 L62.5 36.91 Z" stroke="${c.fg}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M60.94 51.95 L63.67 54.69 L68.36 49.22" fill="none" stroke="${c.fg}" stroke-width="2.73" stroke-linecap="round" stroke-linejoin="round"/></g>`
  return svgOpen(`<rect width="100" height="100" fill="url(#${id}bg)"/><rect width="100" height="100" fill="url(#${id}gl)"/>${g}`, defs)
}

const SH_COLOURS = [
  ['Ember', { bg1: '#2a1f1c', bg2: '#120c0a', glow: '#ff5a2a', hi: '#ffb070', mid: '#f0562a', deep: '#a8241a', rim: '#ffc29a', bar1: '#fff4e0', bar2: '#ffc06a' }],
  ['Toxic', { bg1: '#1a2a22', bg2: '#08120d', glow: '#20e070', hi: '#9dffc4', mid: '#1fcf6a', deep: '#0e7a3e', rim: '#b4ffd2', bar1: '#f0fff5', bar2: '#8affb8' }],
  ['Amethyst', { bg1: '#261f33', bg2: '#100b18', glow: '#9a5cff', hi: '#d0a8ff', mid: '#8a4fff', deep: '#4a1fae', rim: '#e2c8ff', bar1: '#ffffff', bar2: '#d9b8ff' }],
  ['Gold', { bg1: '#2a2416', bg2: '#110e07', glow: '#ffc23a', hi: '#ffe9a0', mid: '#e8b43a', deep: '#9a6a10', rim: '#fff0b8', bar1: '#fffaf0', bar2: '#ffe08a' }],
  ['Sakura', { bg1: '#2e1f27', bg2: '#140b10', glow: '#ff6fae', hi: '#ffd0e4', mid: '#ff6fae', deep: '#c2316f', rim: '#ffe0ee', bar1: '#ffffff', bar2: '#ffc2dc' }],
  ['Silver', { bg1: '#2a2d33', bg2: '#101114', glow: '#c8d0dc', hi: '#f2f4f8', mid: '#9aa3b2', deep: '#4a5262', rim: '#ffffff', bar1: '#ffffff', bar2: '#d8dde6' }],
  ['Arctic', { bg1: '#1b2a30', bg2: '#091216', glow: '#3de0ff', hi: '#c4f6ff', mid: '#2ec4e6', deep: '#126f8f', rim: '#d6fbff', bar1: '#ffffff', bar2: '#a6f0ff' }],
  ['Daylight', { bg1: '#ffffff', bg2: '#dfe5ee', glow: '#5f9bff', hi: '#8fc2ff', mid: '#2f74ea', deep: '#1a44b8', rim: '#b8d8ff', bar1: '#ffffff', bar2: '#bfe4ff' }]
]
const SH_ORIGINAL = { bg1: '#1f2730', bg2: '#0c1016', glow: '#2a7bff', hi: '#6fb0ff', mid: '#2f6fe6', deep: '#1a3fae', rim: '#8cc4ff', bar1: '#e6fbff', bar2: '#7fd0ff' }

const AD_COLOURS = [
  ['Midnight', { bg: ['#1b2040', '#11142b', '#07081a'], body: ['#ffffff', '#cfd6ff'], visor: '#0b0e24', eyes: '#8fa2ff', ring: ['#5366d6', '#8fa2ff'], orb: '#8fa2ff' }, 'In the app'],
  ['Sunrise', { bg: ['#ffb36b', '#ff6f5c', '#d9367a'], body: ['#ffffff', '#ffe6dc'], visor: '#40143a', eyes: '#ffd45c', ring: ['#ffd45c', '#fff2a8'], orb: '#fff2a8' }, 'In the app'],
  ['Mint', { bg: ['#4fe0b0', '#1fbf8f', '#0d7d63'], body: ['#ffffff', '#ddf7ee'], visor: '#0a3a30', eyes: '#a5ffe1', ring: ['#e8b43a', '#ffd45c'], orb: '#ffd45c' }, 'In the app'],
  ['Grape', { bg: ['#b083ff', '#8a4fff', '#5a1fcf'], body: ['#ffffff', '#ebe0ff'], visor: '#2a0f5a', eyes: '#ff9cf6', ring: ['#ff5cf0', '#ff9cf6'], orb: '#ff9cf6' }, 'In the app'],
  ['Mono', { bg: ['#3a3a40', '#232327', '#111113'], body: ['#f4f4f6', '#c9c9cf'], visor: '#111113', eyes: '#ffffff', ring: ['#8a8a92', '#c9c9cf'], orb: '#ffffff' }, 'In the app'],
  ['Daylight', { bg: ['#ffffff', '#eef1ff', '#dfe5ff'], body: ['#4b6bff', '#3a2bc4'], visor: '#ffffff', eyes: '#3a2bc4', ring: ['#e8b43a', '#ffd45c'], orb: '#ffd45c' }, 'In the app'],
  ['Nebula', { bg: ['#ff5cf0', '#7b5cff', '#1a1233'], body: ['#ffffff', '#ffe0fb'], visor: '#1a1233', eyes: '#5ce1ff', ring: ['#5cffa8', '#fff35c'], orb: '#5cffa8' }, 'In the app'],
  ['Ember', { bg: ['#ff7a45', '#e8452c', '#9e1f2a'], body: ['#ffffff', '#ffe4dc'], visor: '#3b0f14', eyes: '#ffd45c', ring: ['#ffd45c', '#fff2a8'], orb: '#fff2a8' }, 'New'],
  ['Ocean', { bg: ['#2fd0e0', '#1a8fc4', '#0f4f8a'], body: ['#ffffff', '#dff4ff'], visor: '#0a2a45', eyes: '#7fffe0', ring: ['#ff9e5c', '#ffc48a'], orb: '#ffc48a' }, 'New'],
  ['Forest', { bg: ['#5cbf6a', '#2e8a4a', '#145a32'], body: ['#ffffff', '#e2f5e4'], visor: '#0f2e1c', eyes: '#c8ff6a', ring: ['#e8b43a', '#ffd45c'], orb: '#ffd45c' }, 'New'],
  ['Gold', { bg: ['#ffe08a', '#e8b43a', '#9a6a10'], body: ['#ffffff', '#fff3d6'], visor: '#3a2608', eyes: '#fff2a8', ring: ['#ffffff', '#fff6d6'], orb: '#ffffff' }, 'New'],
  ['Sakura', { bg: ['#ffd0e4', '#ff8fbf', '#d9367a'], body: ['#ffffff', '#ffe6f0'], visor: '#4a0f2a', eyes: '#ffe36b', ring: ['#ffffff', '#ffe6f0'], orb: '#ffe36b' }, 'New']
]

const WL_COLOURS = [
  ['Ocean', { bg: ['#5fb4ff', '#2f7bf0', '#173f9e'], fg: '#ffffff' }],
  ['Emerald', { bg: ['#4fe0a0', '#1fb87a', '#0d6e4a'], fg: '#ffffff' }],
  ['Violet', { bg: ['#b48cff', '#8a4fff', '#4f1fbf'], fg: '#ffffff' }],
  ['Sunset', { bg: ['#ffb347', '#ff7a3d', '#d9364f'], fg: '#ffffff' }],
  ['Gold', { bg: ['#ffe08a', '#e8b43a', '#9a6a10'], fg: '#ffffff' }],
  ['Graphite', { bg: ['#6b6f7a', '#45484f', '#24262b'], fg: '#ffffff' }],
  ['Midnight', { bg: ['#2a2f45', '#171a2a', '#0a0c16'], fg: '#ff5a6e' }],
  ['Daylight', { bg: ['#ffffff', '#f3f4f7', '#e2e5ee'], fg: '#e23a4e' }]
]


// ── StreamHub holidays ────────────────────────────────────────────────────────────────────
function christmas() {
  let seed = 11
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  const flake = () => { const x = rnd() * 100, y = rnd() * 92, r = 0.45 + rnd() * 1.25; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" opacity="${(0.55 + rnd() * 0.45).toFixed(2)}"/>` }
  const star = (x, y, r) => `<g stroke="#fff" stroke-width="0.5" stroke-linecap="round" opacity="0.9">${[0, 60, 120].map((a) => `<path d="M${x - r} ${y} H${x + r}" transform="rotate(${a} ${x} ${y})"/>`).join('')}</g>`
  let back = '', front = ''
  for (let i = 0; i < 34; i++) back += flake()
  for (let i = 0; i < 12; i++) front += flake()
  front += star(14, 28, 2.4) + star(86, 64, 2) + star(80, 12, 1.8) + star(22, 70, 1.6)
  const drift = `<path d="M0 93 Q12 88 24 92 Q36 96 48 91 Q60 86 72 91 Q86 96 100 90 V100 H0 Z" fill="#f2f7ff" opacity="0.95"/>`
  return classicSH(SH_ORIGINAL, {
    back, front: front + drift
  })
}

// ── Halloween (approved): the bubble in ghostly white on a Halloween night ───────────────────
function halloween() {
  const c = { bg1: '#2b1a45', bg2: '#0a0611', glow: '#d9ccff', hi: '#ffffff', mid: '#f1f0f8', deep: '#bfbbd6', rim: '#ffffff', bar1: '#4a2f86', bar2: '#2a1650' }
  // A bat in flight: round body with two pointed ears, and wings with scalloped trailing edges
  // (the "fingers"), drawn about 22 wide at scale 1.
  const bat = (x, y, s, r = 0) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})" fill="#07050b">
    <path d="M0 -1.6 C-1.2 -3.6 -3.4 -4.6 -5.6 -4.2 C-7.8 -3.8 -9.6 -4.6 -11 -6.2 C-10.8 -3.6 -9.6 -1.4 -7.6 -0.2 C-7.4 1.4 -6.4 2.6 -5 3 C-4.8 1.8 -3.8 1 -2.6 1.2 C-2.2 2.4 -1.2 3.2 0 3.4 C1.2 3.2 2.2 2.4 2.6 1.2 C3.8 1 4.8 1.8 5 3 C6.4 2.6 7.4 1.4 7.6 -0.2 C9.6 -1.4 10.8 -3.6 11 -6.2 C9.6 -4.6 7.8 -3.8 5.6 -4.2 C3.4 -4.6 1.2 -3.6 0 -1.6 Z"/>
    <ellipse cx="0" cy="0.4" rx="1.5" ry="2.6"/>
    <path d="M-1.3 -1.4 L-1.1 -3.8 L-0.3 -2.2 Z M1.3 -1.4 L1.1 -3.8 L0.3 -2.2 Z"/>
  </g>`
  let seed = 5
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  let stars = ''
  for (let i = 0; i < 14; i++) stars += `<circle cx="${(rnd() * 100).toFixed(1)}" cy="${(rnd() * 45).toFixed(1)}" r="${(0.25 + rnd() * 0.5).toFixed(2)}" fill="#fff" opacity="${(0.4 + rnd() * 0.5).toFixed(2)}"/>`
  const moon = `<circle cx="79" cy="20" r="14" fill="url(#MOONH)"/><circle cx="79" cy="20" r="9.5" fill="#ffc35c"/><circle cx="79" cy="20" r="9.5" fill="url(#MOONG)"/>
    <circle cx="75.5" cy="17" r="1.8" fill="#e5a243" opacity="0.55"/><circle cx="82" cy="23.5" r="1.3" fill="#e5a243" opacity="0.55"/><circle cx="82.5" cy="16" r="0.9" fill="#e5a243" opacity="0.5"/>`
  const fog = `<path d="M-5 84 Q15 78 32 83 T68 82 T105 80 V100 H-5 Z" fill="#b9a6ff" opacity="0.13"/><path d="M-5 90 Q20 85 40 90 T80 88 T105 89 V100 H-5 Z" fill="#d6ccff" opacity="0.12"/>`
  return classicSH(c, {
    defs: `<radialGradient id="MOONG" cx="0.35" cy="0.35" r="0.8"><stop offset="0" stop-color="#fff3c4" stop-opacity="0.85"/><stop offset="1" stop-color="#ff9a2a" stop-opacity="0"/></radialGradient>
      <radialGradient id="MOONH" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffb347" stop-opacity="0.45"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>`,
    back: stars + moon + bat(18, 22, 0.9, -12) + bat(33, 12, 0.58, 10) + bat(89, 42, 0.55, -16),
    front: fog
  })
}

// ── Apollo Delta's own icon (src/ui/AppIcon.tsx iconSvg), full-bleed, for its colourways ───────
function apolloSvg(s) {
  const ART = 'translate(512 530) scale(1.12) translate(-512 -530)'
  const FACE = 'translate(512 767) scale(1.22) translate(-512 -767)'
  const id = 'ad' + uid++
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs><linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${s.bg[0]}"/><stop offset="0.55" stop-color="${s.bg[1]}"/><stop offset="1" stop-color="${s.bg[2]}"/></linearGradient>
<radialGradient id="${id}h" cx="0.5" cy="0.42" r="0.55"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.body[0]}"/><stop offset="1" stop-color="${s.body[1]}"/></linearGradient></defs>
<rect width="1024" height="1024" fill="url(#${id}bg)"/><rect width="1024" height="1024" fill="url(#${id}h)"/>
<g fill="#fff"><circle cx="190" cy="210" r="9" opacity="0.8"/><circle cx="840" cy="170" r="7" opacity="0.7"/><circle cx="880" cy="430" r="6" opacity="0.55"/><circle cx="140" cy="520" r="6" opacity="0.5"/><circle cx="770" cy="880" r="8" opacity="0.6"/><circle cx="250" cy="860" r="5" opacity="0.5"/></g>
<g transform="${ART}">
<path d="M 168 742 A 360 92 -12 0 1 856 596" fill="none" stroke="${s.ring[0]}" stroke-width="30" stroke-linecap="round"/>
<line x1="512" y1="300" x2="512" y2="196" stroke="${s.body[0]}" stroke-width="30" stroke-linecap="round"/>
<circle cx="512" cy="172" r="40" fill="${s.orb}"/>
<path d="M 512 300 L 768 740 L 256 740 Z" fill="url(#${id}b)" stroke="url(#${id}b)" stroke-width="120" stroke-linejoin="round"/>
<g transform="${FACE}"><path d="M 396 520 Q 512 470 628 520 Q 660 600 600 640 Q 512 668 424 640 Q 364 600 396 520 Z" fill="${s.visor}"/>
<ellipse cx="462" cy="572" rx="30" ry="38" fill="${s.eyes}"/><ellipse cx="562" cy="572" rx="30" ry="38" fill="${s.eyes}"/>
<circle cx="472" cy="558" r="10" fill="#fff"/><circle cx="572" cy="558" r="10" fill="#fff"/>
<path d="M 478 696 Q 512 722 546 696" fill="none" stroke="${s.visor}" stroke-width="16" stroke-linecap="round"/>
<ellipse cx="392" cy="690" rx="26" ry="15" fill="#ff9ab8" opacity="0.75"/><ellipse cx="632" cy="690" rx="26" ry="15" fill="#ff9ab8" opacity="0.75"/></g>
<path d="M 856 596 A 360 92 -12 0 1 168 742" fill="none" stroke="${s.ring[1]}" stroke-width="34" stroke-linecap="round"/>
</g></svg>`
}
const AD_DEFAULT = { bg: ['#5f86ff', '#4554f2', '#3a2bc4'], body: ['#ffffff', '#dfe5ff'], visor: '#1c2257', eyes: '#7fe3ff', ring: ['#e8b43a', '#ffd45c'], orb: '#ffd45c' }
const WL_DEFAULT = { bg: ['#ff6271', '#e23a4e', '#a5172c'], fg: '#ffffff' }

// ── The catalogue: every icon each app offers, by group (ids are stored in settings) ──────────
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const artStyles = (app) => STYLES.map((s) => ({ id: `art-${s.id}`, name: s.name, group: 'Art Styles', svg: RENDER[s.id](app, P[s.id][app.id]) }))
const CATALOGUE = {
  streamhub: () => [
    ...SH_COLOURS.map(([name, c]) => ({ id: `color-${slug(name)}`, name, group: 'Colours', svg: classicSH(c, { flat: true }) })),
    ...artStyles(APPS[0]),
    { id: 'holiday-christmas', name: 'Christmas', group: 'Holidays', svg: christmas() },
    { id: 'holiday-halloween', name: 'Halloween', group: 'Holidays', svg: halloween() }
  ],
  apollo: () => [
    { id: 'default', name: 'Delta', group: 'Colours', svg: apolloSvg(AD_DEFAULT) },
    ...AD_COLOURS.map(([name, c]) => ({ id: name === 'Daylight' ? 'light' : slug(name), name, group: 'Colours', svg: apolloSvg(c) })),
    ...artStyles(APPS[1])
  ],
  watchlist: () => [
    { id: 'default', name: 'Cinema', group: 'Colours', svg: classicWL(WL_DEFAULT) },
    ...WL_COLOURS.map(([name, c]) => ({ id: `color-${slug(name)}`, name, group: 'Colours', svg: classicWL(c) })),
    ...artStyles(APPS[2])
  ]
}
window.CATALOGUE = CATALOGUE
