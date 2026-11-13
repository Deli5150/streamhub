// Where StreamHub's updates come from: the GitHub repo's Releases (published by scripts/release.mjs).
// Shared by the desktop updater (main/updater.ts) and the phones (mobile/src/lib/updater.ts).

/** owner/name of the public GitHub repo. */
export const RELEASE_REPO = 'Deli5150/streamhub'
export const RELEASES_PAGE = `https://github.com/${RELEASE_REPO}/releases/latest`
export const LATEST_RELEASE_API = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`

/** The parts of GitHub's release JSON the updaters read. */
export interface GitHubRelease {
  tag_name: string
  name?: string
  body?: string
  html_url: string
  draft?: boolean
  prerelease?: boolean
  assets: Array<{ name: string; browser_download_url: string; size: number; digest?: string | null }>
}

/** What a new version offers this install: its version, notes and the file to download. */
export interface ReleaseInfo {
  version: string
  notes: string
  page: string
  asset?: { name: string; url: string; size: number; sha256?: string }
}

/** Which file each kind of install updates from. */
export type InstallKind = 'mac-app' | 'win-nsis' | 'appimage' | 'steam' | 'android' | 'ios' | 'none'

const ASSET_PATTERNS: Record<InstallKind, RegExp | null> = {
  'mac-app': /^StreamHub-[\d.]+-mac\.zip$/,
  'win-nsis': /^StreamHub-Setup-[\d.]+\.exe$/,
  appimage: /^StreamHub-[\d.]+-x86_64\.AppImage$/,
  steam: /^StreamHub-[\d.]+-x86_64\.AppImage$/,
  android: /^StreamHub-[\d.]+\.apk$/,
  // Downloaded to keep (Files), for sideloading again: an iPhone can't install it itself.
  ios: /^StreamHub-[\d.]+\.ipa$/,
  none: null
}

/** "v1.2.10" → [1, 2, 10]; anything after a "-" (pre-release) is ignored. */
const parts = (v: string): number[] =>
  v
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)

/** Negative when a < b, positive when a > b, 0 when equal. */
export function compareVersions(a: string, b: string): number {
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d
  }
  return 0
}

/** The release, if it's newer than `current`, with the file for this kind of install (if it has one). */
export function newerRelease(release: GitHubRelease, current: string, kind: InstallKind): ReleaseInfo | null {
  if (release.draft || release.prerelease) return null
  const version = release.tag_name.replace(/^v/i, '')
  if (compareVersions(version, current) <= 0) return null
  const pattern = ASSET_PATTERNS[kind]
  const file = pattern ? release.assets.find((a) => pattern.test(a.name)) : undefined
  return {
    version,
    notes: (release.body ?? '').trim(),
    page: release.html_url,
    asset: file && {
      name: file.name,
      url: file.browser_download_url,
      size: file.size,
      sha256: file.digest?.startsWith('sha256:') ? file.digest.slice(7) : undefined
    }
  }
}

/** One version's section of CHANGELOG.md (from its "## [x.y.z]" heading to the next), or "" if it has none. */
export function changelogSection(changelog: string, version: string): string {
  const start = changelog.indexOf(`## [${version}]`)
  if (start < 0) return ''
  const rest = changelog.slice(start)
  const next = rest.indexOf('\n## [', 1)
  return (next > 0 ? rest.slice(0, next) : rest).split('\n').slice(1).join('\n').trim()
}
