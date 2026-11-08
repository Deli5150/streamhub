import { TWITCH_AD_FILTER_LIB, TWITCH_AD_HOOK_SOURCES } from './twitchAdHook.generated'

// The script injected at the start of the Twitch player page when "Block Twitch ads" is on (see
// twitchAdHook.ts). Workers get the filter through `prelude`, which runs before their own script.

const { twitchAdPageHook, twitchAdWorkerHook, filteredFetch } = TWITCH_AD_HOOK_SOURCES

const prelude = `var __shAdLib = ${TWITCH_AD_FILTER_LIB};\n(${twitchAdWorkerHook})(__shAdLib, ${filteredFetch});`

export const TWITCH_AD_SCRIPT = `(function () {
  try {
    (${twitchAdPageHook})(${TWITCH_AD_FILTER_LIB}, ${filteredFetch}, ${JSON.stringify(prelude)});
  } catch (e) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ __twitchAds: { log: 'ad blocking failed to start: ' + e } }));
  }
})(); true;`

/** What the hook reports (see Player.tsx). */
export type TwitchAdMessage = { mode: 'worker' | 'page' | 'native' } | { log: string }
