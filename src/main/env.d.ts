/// <reference types="electron-vite/node" />

// Build-time settings from .env (electron-vite exposes MAIN_VITE_* to the main process).
interface ImportMetaEnv {
  /** Google OAuth client (Desktop app type) for YouTube sign-in; see README → YouTube sign-in setup. */
  readonly MAIN_VITE_GOOGLE_CLIENT_ID?: string
  readonly MAIN_VITE_GOOGLE_CLIENT_SECRET?: string
  /** Google OAuth client of the "TVs and Limited Input devices" type, for signing in on a phone (Steam Deck). */
  readonly MAIN_VITE_GOOGLE_TV_CLIENT_ID?: string
  readonly MAIN_VITE_GOOGLE_TV_CLIENT_SECRET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
