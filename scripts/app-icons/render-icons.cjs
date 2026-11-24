// Renders an app's alternate icons (icon-art.js, the designs approved on 2026-11-23) to PNGs:
//   full/<id>.png   1024 px, full-bleed square (Android launcher, Windows)
//   mac/<id>.png    1024 px in the macOS icon shape (dock)
//   thumb/<id>.png  192 px, full-bleed (Settings → App Icon)
//   android/<id>.png 432 px adaptive-icon layer: launchers show only its middle two-thirds, so the
//                   icon is drawn at 5/6 size (its middle 80% shows), over a blurred, enlarged copy
// plus icons.json (id, name, group in order). Run with Electron:
//   electron render-icons.cjs <streamhub|apollo|watchlist> <out dir>
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const [appId, outDir] = process.argv.slice(-2)
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await w.loadURL('data:text/html,<meta charset="utf-8"><body></body>')
  await w.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'icon-art.js'), 'utf8') + ';0')
  const icons = await w.webContents.executeJavaScript(`(async () => {
    const list = window.CATALOGUE[${JSON.stringify(appId)}]()
    const draw = async (svg, size, mac, android) => {
      const img = new Image()
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg.replace('<svg ', '<svg width="1024" height="1024" '))))
      await img.decode()
      const c = document.createElement('canvas')
      c.width = c.height = size
      const g = c.getContext('2d')
      if (mac) {
        // Apple's grid: an 824 px rounded square in the 1024 canvas, with a soft shadow.
        const s = size / 1024, x = 100 * s, r = 185 * s, d = 824 * s
        const shape = () => { g.beginPath(); g.roundRect(x, x, d, d, r) }
        g.save(); g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 20 * s; g.shadowOffsetY = 10 * s; shape(); g.fillStyle = '#000'; g.fill(); g.restore()
        g.save(); shape(); g.clip(); g.drawImage(img, x, x, d, d); g.restore()
      } else if (android) {
        g.filter = 'blur(' + size / 40 + 'px)'
        g.drawImage(img, -size * 0.1, -size * 0.1, size * 1.2, size * 1.2)
        g.filter = 'none'
        const d = size * 5 / 6, o = (size - d) / 2
        g.drawImage(img, o, o, d, d)
      } else g.drawImage(img, 0, 0, size, size)
      return c.toDataURL('image/png').split(',')[1]
    }
    const out = []
    for (const i of list) out.push({ id: i.id, name: i.name, group: i.group, full: await draw(i.svg, 1024), mac: await draw(i.svg, 1024, true), thumb: await draw(i.svg, 192), android: await draw(i.svg, 432, false, true) })
    return out
  })()`)
  for (const kind of ['full', 'mac', 'thumb', 'android']) fs.mkdirSync(path.join(outDir, kind), { recursive: true })
  for (const i of icons) for (const kind of ['full', 'mac', 'thumb', 'android']) fs.writeFileSync(path.join(outDir, kind, `${i.id}.png`), Buffer.from(i[kind], 'base64'))
  fs.writeFileSync(path.join(outDir, 'icons.json'), JSON.stringify(icons.map(({ id, name, group }) => ({ id, name, group })), null, 2) + '\n')
  console.log(`${icons.length} icons → ${outDir}`)
  app.quit()
})
