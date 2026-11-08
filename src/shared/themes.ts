// Colorways ported from the Glaze StreamHub app. Each overrides the seed variables every token
// derives from (--bg, --bg-secondary, --fg, accent). "default" follows the system appearance.

export interface Colorway {
  id: string
  name: string
  appearance: 'light' | 'dark'
  background: string
  backgroundSecondary: string
  foreground: string
  accent: string
  group: 'neutral' | 'dark' | 'light' | 'custom'
}

export const DEFAULT_THEME_ID = 'default'
export const LIGHT_THEME_ID = 'light'
export const DARK_THEME_ID = 'dark'

const dark = (id: string, name: string, background: string, backgroundSecondary: string, foreground: string, accent: string, group: Colorway['group'] = 'dark'): Colorway => ({
  id,
  name,
  appearance: 'dark',
  background,
  backgroundSecondary,
  foreground,
  accent,
  group
})
const light = (id: string, name: string, background: string, backgroundSecondary: string, foreground: string, accent: string, group: Colorway['group'] = 'light'): Colorway => ({
  id,
  name,
  appearance: 'light',
  background,
  backgroundSecondary,
  foreground,
  accent,
  group
})

export const THEMES: Colorway[] = [
  light(LIGHT_THEME_ID, 'Light', '#ffffff', '#f2f2f7', '#1c1c1e', '#007aff', 'neutral'),
  dark(DARK_THEME_ID, 'Dark', '#1c1c1e', '#2c2c2e', '#f5f5f7', '#0a84ff', 'neutral'),
  dark('midnight', 'Midnight', '#0e1330', '#161d4a', '#e6e9ff', '#6d7cff'),
  dark('forest', 'Forest', '#0c1f14', '#123524', '#dff5e6', '#34c759'),
  dark('sunset', 'Sunset', '#2a0f1a', '#46142a', '#ffe6ef', '#ff6b9d'),
  dark('crimson', 'Crimson', '#1f0c0c', '#380f0f', '#ffe3e3', '#ff453a'),
  dark('mocha', 'Mocha', '#1c1410', '#2a1d14', '#f0e4d8', '#c98a5a'),
  // Opera GX look: charcoal with a violet cast, light lavender-gray text, GX red (see styles.css).
  dark('ogx', 'OGX', '#1b1a21', '#24232b', '#e6e3ee', '#ff0a3c', 'custom'),
  // Light colorways use boosted saturation because --bg composites at 40% over the window material.
  light('sky', 'Sky', '#7ec8ff', '#4db0ff', '#0a2540', '#007aff'),
  light('rose', 'Rose', '#ffb3d1', '#ff8cba', '#3d0a23', '#ff2d8a'),
  light('sand', 'Sand', '#ffd98a', '#ffc94d', '#3a2a0a', '#cc7a00'),
  light('mint', 'Mint', '#7ef0b0', '#3de88f', '#093821', '#00a85a'),
  light('lavender', 'Lavender', '#c9b3ff', '#b18cff', '#291545', '#7c3aed'),
  light('aqua', 'Aqua', '#6ee8e0', '#2dd4cc', '#093431', '#009e96'),
  light('coral', 'Coral', '#ffb09a', '#ff8a6b', '#3d1407', '#e0502a'),
  light('lemon', 'Lemon', '#ffe85c', '#ffd91f', '#37300a', '#a98800')
]

export const getTheme = (id: string): Colorway | null => THEMES.find((t) => t.id === id) ?? null
