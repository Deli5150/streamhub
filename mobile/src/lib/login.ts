import { create } from 'zustand'
import type { Platform } from '@shared/types'

/** The sign-in screen currently open (one at a time), shown by <LoginSheet />. */
export interface LoginRequest {
  platform: Platform
  url: string
  userAgent?: string
  /** After every page navigation. */
  onNavigate(): void
  /** The user closed the screen. */
  onClose(): void
}

export const useLogin = create<{ request: LoginRequest | null; open(r: LoginRequest): void; close(r: LoginRequest): void }>((set, get) => ({
  request: null,
  open: (request) => {
    // A second sign-in replaces the first, which then counts as closed.
    get().request?.onClose()
    set({ request })
  },
  /** Closes `r` if it's still the one showing. */
  close: (r) => get().request === r && set({ request: null })
}))
