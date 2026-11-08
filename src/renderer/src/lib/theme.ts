import { getTheme } from '@shared/themes'

const SEEDS = ['--bg', '--bg-secondary', '--fg', '--selection', '--theme-accent', '--accent', '--red', '--green', '--popover-base', 'color-scheme'] as const

/**
 * Applies a colorway by overriding the seed variables inline on <html> (beating the
 * prefers-color-scheme defaults in styles.css). "default" removes the overrides.
 */
export function applyColorway(id: string): void {
  const root = document.documentElement
  const theme = getTheme(id)
  for (const v of SEEDS) root.style.removeProperty(v)
  root.toggleAttribute('data-theme-ogx', id === 'ogx')
  root.toggleAttribute('data-colorway', !!theme)
  if (theme) root.setAttribute('data-appearance', theme.appearance)
  else root.removeAttribute('data-appearance')
  if (!theme) return
  const dark = theme.appearance === 'dark'
  const set = (k: (typeof SEEDS)[number], v: string): void => root.style.setProperty(k, v)
  set('--bg', theme.background)
  set('--bg-secondary', theme.backgroundSecondary)
  set('--fg', theme.foreground)
  set('--selection', theme.accent)
  set('--theme-accent', theme.accent)
  // Set --accent directly so the colorway wins over the macOS system accent.
  set('--accent', theme.accent)
  set('--red', dark ? '#ff6363' : '#b12424')
  set('--green', dark ? '#59d499' : '#006b4f')
  set('--popover-base', dark ? '#111113' : '#fcfcfc')
  set('color-scheme', theme.appearance)
}
