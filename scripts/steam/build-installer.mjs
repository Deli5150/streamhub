// Builds dist/StreamHub-<version>-Steam-Installer.sh: scripts/steam/install.sh with the Linux
// AppImage, the Steam artwork (build/steam, from render-art.cjs) and the Steam helper
// (steam-shortcut.py) packed onto its end as a tar. One file to download and run on a Steam Deck.
// Run after `npm run dist:linux` (`npm run dist:steam` does both).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const appImage = path.join(root, `dist/StreamHub-${version}-x86_64.AppImage`)
const art = path.join(root, 'build/steam')
if (!fs.existsSync(appImage)) throw new Error(`${appImage} is missing: run npm run dist:linux first`)

const stage = path.join(root, 'dist/.steam-installer')
fs.rmSync(stage, { recursive: true, force: true })
fs.mkdirSync(path.join(stage, 'art'), { recursive: true })
fs.copyFileSync(appImage, path.join(stage, 'StreamHub.AppImage'))
for (const file of ['cover.png', 'wide.png', 'hero.png', 'logo.png']) fs.copyFileSync(path.join(art, file), path.join(stage, 'art', file))
fs.copyFileSync(path.join(art, 'icon.png'), path.join(stage, 'icon.png'))
fs.copyFileSync(path.join(root, 'scripts/steam/steam-shortcut.py'), path.join(stage, 'steam-shortcut.py'))

// Plain tar (the AppImage is compressed already), without macOS's extended attributes.
const tar = path.join(root, 'dist/.steam-installer.tar')
const mac = process.platform === 'darwin' ? ['--no-mac-metadata', '--no-xattrs'] : []
execFileSync('tar', [...mac, '-cf', tar, '-C', stage, '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' } })

// The script, with the line its payload starts on (the one after its last).
const template = fs.readFileSync(path.join(root, 'scripts/steam/install.sh'), 'utf8')
const lines = template.endsWith('\n') ? template.split('\n').length - 1 : template.split('\n').length
const script = template.replaceAll('__VERSION__', version).replace('__PAYLOAD_LINE__', String(lines + 1))
const out = path.join(root, `dist/StreamHub-${version}-Steam-Installer.sh`)
fs.writeFileSync(out, Buffer.concat([Buffer.from(script.endsWith('\n') ? script : `${script}\n`), fs.readFileSync(tar)]), { mode: 0o755 })
fs.chmodSync(out, 0o755)
fs.rmSync(stage, { recursive: true, force: true })
fs.rmSync(tar)
console.log(`wrote ${path.relative(root, out)} (${Math.round(fs.statSync(out).size / 1e6)} MB)`)
