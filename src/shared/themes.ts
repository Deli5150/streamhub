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
  light(LIGHT_THEME_ID, 'Light', '#ffffff', '#ececf1', '#1c1c1e', '#007aff', 'neutral'),
  dark(DARK_THEME_ID, 'Dark', '#1c1c1e', '#2c2c2e', '#f5f5f7', '#0a84ff', 'neutral'),
  dark('midnight', 'Midnight', '#0e1330', '#161d4a', '#e6e9ff', '#6d7cff'),
  dark('forest', 'Forest', '#0c1f14', '#123524', '#dff5e6', '#34c759'),
  dark('sunset', 'Sunset', '#2a0f1a', '#46142a', '#ffe6ef', '#ff6b9d'),
  dark('crimson', 'Crimson', '#1f0c0c', '#380f0f', '#ffe3e3', '#ff453a'),
  dark('mocha', 'Mocha', '#1c1410', '#2a1d14', '#f0e4d8', '#c98a5a'),
  dark('ocean', 'Ocean', '#071b23', '#0e2f3b', '#dff6ff', '#2ec4d6'),
  dark('grape', 'Grape', '#190f28', '#2a1a44', '#efe6ff', '#a66bff'),
  dark('slate', 'Slate', '#15191f', '#232a34', '#e3e8ef', '#7aa2d6'),
  dark('ember', 'Ember', '#1f1208', '#352110', '#ffeedd', '#ff8a2a'),
  dark('arctic', 'Arctic', '#0c1522', '#16263d', '#e6f1ff', '#5fb4ff'),
  // Opera GX look: charcoal with a violet cast, light lavender-gray text, GX red (see styles.css).
  dark('ogx', 'OGX', '#1b1a21', '#24232b', '#e6e3ee', '#ff0a3c', 'custom'),
  // Colorways paint the window solid (styles.css), so light ones are soft tints; the secondary color,
  // a step deeper, colors the sidebar, panels and fields.
  light('sky', 'Sky', '#dcefff', '#bcdfff', '#0a2540', '#007aff'),
  light('rose', 'Rose', '#ffe2ee', '#ffc6dc', '#3d0a23', '#e0246f'),
  light('sand', 'Sand', '#fff1d2', '#ffdf98', '#3a2a0a', '#c06f00'),
  light('mint', 'Mint', '#dbf7e8', '#b3eccd', '#093821', '#00965a'),
  light('lavender', 'Lavender', '#eee6ff', '#d9c9ff', '#291545', '#7c3aed'),
  light('aqua', 'Aqua', '#d6f6f3', '#aaebe5', '#093431', '#008f88'),
  light('coral', 'Coral', '#ffe5dc', '#ffc9b7', '#3d1407', '#d9481f'),
  light('lemon', 'Lemon', '#fff9c9', '#fff08c', '#37300a', '#8f7400'),
  light('peach', 'Peach', '#ffeadb', '#ffd2b3', '#3d1d0a', '#e3661a'),
  light('sage', 'Sage', '#e5f0e3', '#c8dfc4', '#1c2e1b', '#3b8a46'),
  light('blush', 'Blush', '#fbe6ec', '#f4c9d6', '#3b1520', '#cf2f68'),
  light('cloud', 'Cloud', '#e8eef6', '#cfdbea', '#16202c', '#3a6db4')
]

export const getTheme = (id: string): Colorway | null => THEMES.find((t) => t.id === id) ?? null
