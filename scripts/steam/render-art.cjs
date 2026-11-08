// Renders StreamHub's Steam library artwork (cover, banner, hero, logo, icon) into build/steam/,
// for the SteamOS installer (scripts/steam/build-installer.mjs) to put in Steam's grid folder.
// Run with Electron: `npx electron scripts/steam/render-art.cjs`. Same look as Big Picture's intro.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '../..')
const out = path.join(root, 'build/steam')
const font = path.join(root, 'src/renderer/src/assets/fonts/InterVariable.woff2')
const icon = path.join(root, 'build/icon.png')

const base = `
  @font-face { font-family: Inter; src: url("${font}") format("woff2"); font-weight: 100 900; }
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; font-family: Inter, sans-serif; color: #fff; }
  .bg { position: absolute; inset: 0; background: #0b0b10; }
  .glow { position: absolute; border-radius: 50%; background: radial-gradient(circle, rgba(120,110,255,0.32), rgba(120,110,255,0.08) 45%, rgba(11,11,16,0) 70%); }
  .title { font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
  .sub { font-weight: 600; letter-spacing: 0.32em; text-transform: uppercase; color: rgba(255,255,255,0.72); }
  .rule { height: 3px; border-radius: 3px; background: linear-gradient(to right, rgba(255,255,255,0), rgba(255,255,255,0.85), rgba(255,255,255,0)); }
  img.icon { display: block; filter: drop-shadow(0 18px 40px rgba(0,0,0,0.55)); }
`

/** [file, width, height, transparent, body] */
const ART = [
  [
    'cover.png', // portrait capsule, 600x900
    600,
    900,
    false,
    `<div class="bg"></div><div class="glow" style="width:900px;height:900px;left:-150px;top:-60px"></div>
     <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0">
       <img class="icon" src="${icon}" style="width:250px;height:250px;margin-bottom:56px">
       <div class="title" style="font-size:96px">StreamHub</div>
       <div class="rule" style="width:200px;margin-top:34px"></div>
       <div class="sub" style="font-size:24px;margin-top:28px">Big Picture</div>
     </div>`
  ],
  [
    'wide.png', // horizontal capsule, 920x430
    920,
    430,
    false,
    `<div class="bg"></div><div class="glow" style="width:800px;height:800px;left:-120px;top:-185px"></div>
     <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:48px">
       <img class="icon" src="${icon}" style="width:190px;height:190px">
       <div><div class="title" style="font-size:92px">StreamHub</div><div class="sub" style="font-size:22px;margin-top:22px">Big Picture</div></div>
     </div>`
  ],
  [
    'hero.png', // library hero, 1920x620 (the logo sits over it)
    1920,
    620,
    false,
    `<div class="bg"></div>
     <div class="glow" style="width:1500px;height:1500px;left:-350px;top:-440px"></div>
     <div class="glow" style="width:1100px;height:1100px;left:1050px;top:-300px;opacity:.7"></div>
     <img src="${icon}" style="position:absolute;width:760px;height:760px;right:-60px;top:-70px;opacity:.22;filter:blur(2px)">`
  ],
  [
    'logo.png', // logo over the hero, transparent
    1280,
    360,
    true,
    `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:52px">
       <img class="icon" src="${icon}" style="width:220px;height:220px">
       <div class="title" style="font-size:150px;text-shadow:0 10px 40px rgba(0,0,0,.5)">StreamHub</div>
     </div>`
  ]
]

async function render([file, width, height, transparent, body]) {
  const win = new BrowserWindow({ show: false, width, height, transparent, frame: false, useContentSize: true, webPreferences: { offscreen: true } })
  const html = path.join(out, `.render-${file}.html`)
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>${base}${transparent ? 'html,body{background:transparent}' : ''}</style><body>${body}</body>`)
  await win.loadFile(html)
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode())))')
  await new Promise((r) => setTimeout(r, 400))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width, height })
  fs.writeFileSync(path.join(out, file), image.resize({ width, height }).toPNG())
  win.destroy()
  fs.rmSync(html)
}

app.disableHardwareAcceleration()
// Each image's window closes before the next opens; don't quit in between.
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true })
  for (const art of ART) await render(art)
  // The shortcut's icon: the app icon at a size Steam shows crisply.
  const { nativeImage } = require('electron')
  fs.writeFileSync(path.join(out, 'icon.png'), nativeImage.createFromPath(icon).resize({ width: 256, height: 256, quality: 'best' }).toPNG())
  console.log('wrote', fs.readdirSync(out).join(', '))
  app.quit()
})
