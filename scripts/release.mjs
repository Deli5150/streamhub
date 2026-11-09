// Publishes a GitHub Release for the version in package.json, with every download attached and the
// notes from that version's CHANGELOG.md section. The in-app updaters (src/main/updater.ts,
// mobile/src/lib/updater.ts) read these releases, so the file names matter (see src/shared/release.ts).
//
//   npm run release              files from dist/ (and the APK from mobile/android/…/release)
//   npm run release -- --from ~/Downloads   files from another folder
//
// Build first: `npx electron-vite build && npx electron-builder --mac --win --linux`, then
// `node scripts/steam/build-installer.mjs` and the APK (see mobile/README.md), all in dist/.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const fromArg = process.argv.indexOf('--from')
const from = fromArg > 0 ? process.argv[fromArg + 1].replace(/^~/, os.homedir()) : null

const files = [
  `StreamHub-${version}.dmg`,
  `StreamHub-${version}-mac.zip`,
  `StreamHub-Setup-${version}.exe`,
  `StreamHub-${version}-x86_64.AppImage`,
  `StreamHub-${version}-Steam-Installer.sh`,
  `StreamHub-${version}.apk`
]
// The iPhone .ipa isn't released: it's signed for the owner's own iPhone (free Apple ID) and goes
// to ~/Downloads instead.
const find = (name) => {
  const places = from ? [from] : [path.join(root, 'dist'), path.join(root, 'mobile/android/app/build/outputs/apk/release')]
  for (const dir of places) {
    const file = path.join(dir, name)
    if (fs.existsSync(file)) return file
  }
  // The APK is built as app-release.apk.
  if (name.endsWith('.apk') && !from) {
    const built = path.join(root, 'mobile/android/app/build/outputs/apk/release/app-release.apk')
    if (fs.existsSync(built)) {
      const named = path.join(root, 'dist', name)
      fs.copyFileSync(built, named)
      return named
    }
  }
  return null
}

const assets = files.map((name) => ({ name, file: find(name) }))
const missing = assets.filter((a) => !a.file)
if (missing.length) console.warn(`Not attached (not found): ${missing.map((a) => a.name).join(', ')}`)

// This version's section of CHANGELOG.md: from its "## [x.y.z]" heading to the next one.
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
const start = changelog.indexOf(`## [${version}]`)
if (start < 0) throw new Error(`CHANGELOG.md has no "## [${version}]" section`)
const rest = changelog.slice(start)
const next = rest.indexOf('\n## [', 1)
const notes = (next > 0 ? rest.slice(0, next) : rest).split('\n').slice(1).join('\n').trim()
const notesFile = path.join(os.tmpdir(), `streamhub-${version}-notes.md`)
fs.writeFileSync(notesFile, notes)

const tag = `v${version}`
execFileSync(
  'gh',
  ['release', 'create', tag, '--title', `StreamHub ${version}`, '--notes-file', notesFile, ...assets.filter((a) => a.file).map((a) => a.file)],
  { cwd: root, stdio: 'inherit' }
)
console.log(`Published ${tag}`)
