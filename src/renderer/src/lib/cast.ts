import { useEffect } from 'react'
import { create } from 'zustand'
import type { CastDevice, CastPlayRequest, CastStatus } from '@shared/types'

// Casting to a TV (main/cast.ts does the talking). As on Android: once a TV is picked, whichever
// player is on screen sends its video there and shows "Playing on <TV>" instead of playing itself,
// until you stop casting (or someone stops it on the TV).

export const useCast = create<{ device: CastDevice | null; status: CastStatus }>(() => ({ device: null, status: { device: null, state: 'idle' } }))

window.api.onCastStatus((status) => useCast.setState({ status, ...(status.device ? {} : { device: null }) }))

export const castTo = (device: CastDevice): void => useCast.setState({ device })

export async function stopCasting(): Promise<void> {
  useCast.setState({ device: null })
  await window.api.castStop()
}

/**
 * While a TV is picked, sends this player's video to it (once per video) and reports how that went;
 * null when not casting, so the player plays here as usual. `req` null: this player has nothing to cast.
 */
export function useCastPlayback(req: CastPlayRequest | null): CastStatus | null {
  const device = useCast((s) => s.device)
  const status = useCast((s) => s.status)
  useEffect(() => {
    if (device && req) void window.api.castPlay(device, req)
    // The title and position at the moment it's sent are enough; they don't resend it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.id, req?.url, req?.platform])
  if (!device || !req) return null
  return status.url === req.url && status.device ? status : { device, state: 'loading', url: req.url }
}
