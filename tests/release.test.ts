import { describe, expect, it } from 'vitest'
import { changelogSection, compareVersions, newerRelease, type GitHubRelease } from '@shared/release'

const release = (tag: string, extra: Partial<GitHubRelease> = {}): GitHubRelease => ({
  tag_name: tag,
  html_url: `https://github.com/o/streamhub/releases/tag/${tag}`,
  body: '## Fixes\n- Queue',
  assets: [
    { name: `StreamHub-${tag.slice(1)}.dmg`, browser_download_url: 'https://x/dmg', size: 1 },
    { name: `StreamHub-${tag.slice(1)}-mac.zip`, browser_download_url: 'https://x/zip', size: 2, digest: 'sha256:abc' },
    { name: `StreamHub-Setup-${tag.slice(1)}.exe`, browser_download_url: 'https://x/exe', size: 3 },
    { name: `StreamHub-${tag.slice(1)}-x86_64.AppImage`, browser_download_url: 'https://x/appimage', size: 4 },
    { name: `StreamHub-${tag.slice(1)}-Steam-Installer.sh`, browser_download_url: 'https://x/sh', size: 5 },
    { name: `StreamHub-${tag.slice(1)}.apk`, browser_download_url: 'https://x/apk', size: 6 }
  ],
  ...extra
})

describe('compareVersions', () => {
  it('orders by number, not text', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0)
    expect(compareVersions('v1.0.8', '1.0.8')).toBe(0)
    expect(compareVersions('1.0', '1.0.1')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0)
  })
})

describe('newerRelease', () => {
  it('picks each install kind its own file', () => {
    expect(newerRelease(release('v1.0.8'), '1.0.7', 'mac-app')?.asset).toEqual({
      name: 'StreamHub-1.0.8-mac.zip',
      url: 'https://x/zip',
      size: 2,
      sha256: 'abc'
    })
    expect(newerRelease(release('v1.0.8'), '1.0.7', 'win-nsis')?.asset?.name).toBe('StreamHub-Setup-1.0.8.exe')
    expect(newerRelease(release('v1.0.8'), '1.0.7', 'appimage')?.asset?.name).toBe('StreamHub-1.0.8-x86_64.AppImage')
    expect(newerRelease(release('v1.0.8'), '1.0.7', 'steam')?.asset?.name).toBe('StreamHub-1.0.8-x86_64.AppImage')
    expect(newerRelease(release('v1.0.8'), '1.0.7', 'android')?.asset?.name).toBe('StreamHub-1.0.8.apk')
  })

  it('has no file for installs that update from the release page', () => {
    const r = newerRelease(release('v1.0.8'), '1.0.7', 'none')
    expect(r?.version).toBe('1.0.8')
    expect(r?.asset).toBeUndefined()
  })

  it('ignores the same or an older version, drafts and pre-releases', () => {
    expect(newerRelease(release('v1.0.7'), '1.0.7', 'mac-app')).toBeNull()
    expect(newerRelease(release('v1.0.6'), '1.0.7', 'mac-app')).toBeNull()
    expect(newerRelease(release('v1.0.9', { prerelease: true }), '1.0.7', 'mac-app')).toBeNull()
    expect(newerRelease(release('v1.0.9', { draft: true }), '1.0.7', 'mac-app')).toBeNull()
  })
})

describe('changelogSection', () => {
  const md = '# Changelog\n\nintro\n\n## [1.0.8]\n\n### New\n- A\n\n## [1.0.7]\n\n- B\n'
  it("reads one version's notes", () => {
    expect(changelogSection(md, '1.0.8')).toBe('### New\n- A')
    expect(changelogSection(md, '1.0.7')).toBe('- B')
    expect(changelogSection(md, '9.9.9')).toBe('')
  })
})
