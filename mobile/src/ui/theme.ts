import { createContext, useContext } from 'react'
import { useColorScheme } from 'react-native'
import type { Platform } from '@shared/types'
import { DARK_THEME_ID, LIGHT_THEME_ID, getTheme } from '@shared/themes'
import { useApp } from '../lib/hub'

// The desktop's colorways (src/shared/themes.ts) turned into the colors the screens use. "default"
// follows the phone's light/dark appearance.

export interface Colors {
  dark: boolean
  /** Drawn over a wallpaper: rows and headers sit on frosted panels (see overWallpaper). */
  overWallpaper?: boolean
  bg: string
  bg2: string
  card: string
  fg: string
  fg2: string
  fg3: string
  separator: string
  accent: string
  onAccent: string
  danger: string
  success: string
  /**
   * Font for screen titles and section headings in the styled themes: Nothing's dot matrix (Doto) or
   * Pixel's Google Sans Flex. Bundled by expo-font (app.config.ts); unset for the other themes.
   */
  display?: string
  /** The styled theme's look (see shared/themes.ts), for icons and shapes. */
  style?: 'nothing' | 'pixel'
}

function mix(hex: string, other: string, amount: number): string {
  const a = hex.replace('#', '')
  const b = other.replace('#', '')
  const ch = (s: string, i: number): number => parseInt(s.slice(i, i + 2), 16)
  const out = [0, 2, 4].map((i) => Math.round(ch(a, i) * (1 - amount) + ch(b, i) * amount))
  return `#${out.map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

export function colorsFor(themeId: string, systemDark: boolean): Colors {
  const theme = getTheme(themeId) ?? getTheme(systemDark ? DARK_THEME_ID : LIGHT_THEME_ID)!
  const dark = theme.appearance === 'dark'
  return {
    dark,
    bg: theme.background,
    bg2: theme.backgroundSecondary,
    card: dark ? mix(theme.backgroundSecondary, '#ffffff', 0.04) : mix(theme.backgroundSecondary, theme.background, 0.45),
    fg: theme.foreground,
    fg2: mix(theme.foreground, theme.background, 0.3),
    fg3: mix(theme.foreground, theme.background, 0.5),
    separator: mix(theme.foreground, theme.background, 0.85),
    accent: theme.accent,
    onAccent: '#ffffff',
    danger: dark ? '#ff453a' : '#d70015',
    success: dark ? '#30d158' : '#248a3d',
    style: theme.style,
    display: theme.style === 'nothing' ? 'Doto-Bold' : theme.style === 'pixel' ? 'GoogleSansFlex-Bold' : undefined
  }
}

/** Style for a title in the theme's display font (the font file is already bold), or nothing. */
export const displayFont = (c: Colors): { fontFamily: string; fontWeight: 'normal' } | null =>
  c.display ? { fontFamily: c.display, fontWeight: 'normal' } : null

/** Colors for a screen drawn over a wallpaper (see overWallpaper); null everywhere else. */
export const ColorsOverride = createContext<Colors | null>(null)

export function useColors(): Colors {
  const override = useContext(ColorsOverride)
  const scheme = useColorScheme()
  const themeId = useApp((s) => s.app?.settings.theme ?? 'default')
  return override ?? colorsFor(themeId, scheme !== 'light')
}

/**
 * Over a wallpaper, text switches to black or white by the image's brightness (as on the desktop),
 * and surfaces become translucent so the image shows through.
 */
export function overWallpaper(c: Colors, light: boolean): Colors {
  const ink = light ? '0,0,0' : '255,255,255'
  // Panels behind text: the image's own tone, frosted, so text never sits right on a busy photo.
  const panel = light ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.5)'
  return {
    ...c,
    dark: !light,
    overWallpaper: true,
    bg: 'transparent',
    bg2: light ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.42)',
    card: panel,
    fg: light ? '#000000' : '#ffffff',
    fg2: `rgba(${ink},0.88)`,
    fg3: `rgba(${ink},0.72)`,
    separator: `rgba(${ink},0.18)`
  }
}

export const PLATFORM_COLOR: Record<Platform, string> = {
  twitch: '#9146FF',
  youtube: '#FF0033',
  kick: '#53FC18',
  rumble: '#85C742'
}

/** Text/icon color that reads on the platform's brand color. */
export const PLATFORM_ON_COLOR: Record<Platform, string> = {
  twitch: '#ffffff',
  youtube: '#ffffff',
  kick: '#000000',
  rumble: '#ffffff'
}

export const formatViewers = (n?: number): string =>
  n === undefined ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n)

export function uptime(startedAt?: string): string {
  if (!startedAt) return ''
  const mins = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 60_000))
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
}

export const errorMessage = (e: unknown): string => String((e as Error)?.message ?? e)
