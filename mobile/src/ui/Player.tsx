import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Platform as OS, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Icon } from './Icon'
import { useEvent } from 'expo'
import { VideoView, useVideoPlayer, type VideoView as VideoViewType } from 'expo-video'
import * as WebBrowser from 'expo-web-browser'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import type { Platform } from '@shared/types'
import { useApp } from '../lib/hub'
import { GoogleCast, useCastPlayback, type CastInfo, type CastPlayback } from '../lib/cast'
import { DESKTOP_UA } from '../lib/reader'
import { TWITCH_AD_SCRIPT, type TwitchAdMessage } from '../player/twitchAds'
import { RUMBLE_AD_SCRIPT, stripRumbleAds } from '../player/rumbleAds'
import { getText } from '../desktop/net'
import { enterAppPip, usePipActive } from './pip'

// Plays a platform's embedded player page (live streams, past broadcasts, clips) in a WebView, or a
// direct HLS stream (Kick videos and clips) in the native player. Both report progress so videos
// resume where you left off, and both can go picture-in-picture.

export interface PlayerHandle {
  pip(): void
}

interface Props {
  platform: Platform
  /** Player page URL (WebView), or the HLS URL when `hls` is set. */
  url: string
  hls?: boolean
  /** Seconds to start at. */
  resumeAt?: number
  onProgress?(t: number, d: number): void
  onEnded?(): void
  style?: StyleProp<ViewStyle>
  /** What a TV shows while this is cast to it (Android). */
  castInfo?: CastInfo
}

export const Player = forwardRef<PlayerHandle, Props>(function Player(props, ref) {
  // Cast to a TV (Android): the TV plays it, and the phone shows what's playing where.
  const cast = useCastPlayback(props.platform, props.url, Boolean(props.hls), props.resumeAt ?? 0, props.castInfo)
  if (cast) return <CastingView cast={cast} style={props.style} />
  return props.hls ? <HlsPlayer {...props} ref={ref} /> : <WebPlayer {...props} ref={ref} />
})

/** In place of the player while a TV plays the video. */
function CastingView({ cast, style }: { cast: CastPlayback; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const stop = (): void => void GoogleCast?.default.getSessionManager().endCurrentSession(true)
  return (
    <View style={[styles.box, styles.casting, style]}>
      <Icon name={cast.state === 'error' ? 'alert-circle-outline' : 'tv-outline'} size={34} color="#fffc" />
      <Text style={styles.castTitle}>
        {cast.state === 'error' ? `Couldn’t play this on ${cast.device}` : cast.state === 'loading' ? `Sending to ${cast.device}…` : `Playing on ${cast.device}`}
      </Text>
      {cast.state === 'loading' ? <ActivityIndicator color="#fffc" /> : null}
      {cast.state === 'error' && cast.error ? <Text style={styles.castDetail}>{cast.error}</Text> : null}
      <View style={styles.castActions}>
        {cast.youtubeId ? (
          <CastAction icon="logo-youtube" label="Open in YouTube app" onPress={() => void Linking.openURL(`https://www.youtube.com/watch?v=${cast.youtubeId}`)} />
        ) : null}
        <CastAction icon="phone-portrait-outline" label={cast.state === 'error' ? 'Play on phone' : 'Stop casting'} onPress={stop} />
      </View>
    </View>
  )
}

function CastAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress(): void }): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.castAction, pressed && { opacity: 0.6 }]} accessibilityRole="button">
      <Icon name={icon} size={16} color="#fff" />
      <Text style={styles.castActionText}>{label}</Text>
    </Pressable>
  )
}

/**
 * Runs in the player page: applies the mute state and start position, reports progress and the end
 * of the video, and exposes picture-in-picture. Player pages swap their <video> element now and
 * then, so everything is (re)applied on a timer rather than once.
 */
const playerScript = (resumeAt: number): string => `(function () {
  if (window.__sh) return;
  window.__sh = { resume: ${resumeAt || 0}, resumed: false };
  var post = function (m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)) };
  var videos = function () { return Array.prototype.slice.call(document.querySelectorAll('video')) };
  var current = function () { return videos().filter(function (v) { return v.duration > 0 })[0] };
  // Android picture-in-picture shrinks the whole app; player pages don't relayout their video for
  // that short, wide window, so while it lasts the video is pinned to fill the page instead.
  window.__shPipFill = function (on) {
    var el = document.getElementById('__sh-pip-fill');
    if (on && !el) {
      el = document.createElement('style');
      el.id = '__sh-pip-fill';
      el.textContent = 'video { position: fixed !important; left: 0 !important; top: 0 !important; width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important; object-fit: contain !important; z-index: 2147483647 !important; background: #000 !important; transform: none !important; }';
      (document.head || document.documentElement).appendChild(el);
    } else if (!on && el) el.remove();
    post({ __player: 'viewport', w: window.innerWidth, h: window.innerHeight, pip: on });
  };
  window.__shPip = function () {
    var v = current() || videos()[0];
    if (!v) return;
    if (v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode('picture-in-picture')) v.webkitSetPresentationMode('picture-in-picture');
    else if (v.requestPictureInPicture) v.requestPictureInPicture().catch(function () {});
  };
  setInterval(function () {
    var v = current();
    if (!v) return;
    if (!window.__sh.resumed && window.__sh.resume > 0 && isFinite(v.duration)) {
      v.currentTime = window.__sh.resume;
      window.__sh.resumed = true;
    }
    if (isFinite(v.duration)) post({ __player: 'progress', t: v.currentTime, d: v.duration });
  }, 2000);
  document.addEventListener('ended', function () { post({ __player: 'ended' }) }, true);
})(); true;`

/** Live Twitch streams (not past broadcasts or clips) are where ads are stitched in and filtered. */
const isTwitchLive = (url: string): boolean => /^https:\/\/player\.twitch\.tv\/\?(.*&)?channel=/.test(url)

/** A short notice over the player when the ad filter handled an ad break (null: nothing to say). */
function adNotice(log: string): string | null {
  if (log.includes('playing the ad-free stream')) return 'Ad break — watching an ad-free copy'
  if (/skipped \d+ ad segment|cut the ad break/.test(log)) return 'Ad break skipped'
  if (log.includes('holding the stream')) return 'Waiting out an ad break'
  return null
}

/** Rumble's embedded player page (live streams and videos), where its ads are removed. */
const isRumbleEmbed = (url: string): boolean => /^https:\/\/rumble\.com\/embed\//.test(url)

/**
 * What the WebView loads: the URL itself, or for Rumble the embed page fetched by the app with its
 * ad schedule removed (see player/rumbleAds.ts). null while that page is being fetched.
 */
function usePlayerSource(platform: Platform, url: string): { uri: string; headers?: Record<string, string> } | { html: string; baseUrl: string } | null {
  const rumble = platform === 'rumble' && isRumbleEmbed(url)
  const [page, setPage] = useState<{ for: string; html: string | null } | null>(null)
  useEffect(() => {
    if (!rumble) return
    let cancelled = false
    // Never hold the player back for long: past the deadline it loads the page as is.
    const deadline = setTimeout(() => !cancelled && setPage({ for: url, html: null }), 6000)
    getText('rumble', url)
      .then((html) => {
        const { html: clean, removed } = stripRumbleAds(html)
        console.log(`[rumble ads] removed ${removed} ad schedule${removed === 1 ? '' : 's'}`)
        if (!cancelled) setPage({ for: url, html: clean })
      })
      .catch((e) => {
        console.log('[rumble ads] embed page not loaded, playing it as is:', (e as Error).message)
        if (!cancelled) setPage({ for: url, html: null })
      })
      .finally(() => clearTimeout(deadline))
    return () => {
      cancelled = true
      clearTimeout(deadline)
    }
  }, [rumble, url])
  if (!rumble) return { uri: url, headers: platform === 'youtube' ? { Referer: 'https://streamhub.app/' } : undefined }
  if (page?.for !== url) return null
  return page.html ? { html: page.html, baseUrl: url } : { uri: url }
}

/** Twitch's popout player and chat expect the desktop site; the others play fine as mobile pages. */
const playerUserAgent = (p: Platform): string | undefined => (p === 'twitch' ? DESKTOP_UA : undefined)

const WebPlayer = forwardRef<PlayerHandle, Props>(function WebPlayer({ platform, url, resumeAt = 0, onProgress, onEnded, style }, ref) {
  const view = useRef<React.ComponentRef<typeof WebView>>(null)
  // The latest callbacks, for page messages and player events that arrive later.
  const callbacks = useRef({ onProgress, onEnded })
  useEffect(() => {
    callbacks.current = { onProgress, onEnded }
  })
  const host = useMemo(() => hostOf(url), [url])
  const blockAds = useApp((s) => s.app?.settings.blockTwitchAds ?? true) && platform === 'twitch' && isTwitchLive(url)
  const inPip = usePipActive()
  useEffect(() => {
    view.current?.injectJavaScript(`window.__shPipFill && window.__shPipFill(${inPip}); true;`)
  }, [inPip])
  const source = usePlayerSource(platform, url)
  const adScript = blockAds ? TWITCH_AD_SCRIPT : platform === 'rumble' && isRumbleEmbed(url) ? RUMBLE_AD_SCRIPT : undefined
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (noticeTimer.current && clearTimeout(noticeTimer.current)), [])
  // The start position goes into the page script once, when the player loads.
  const script = useMemo(() => playerScript(resumeAt), [url]) // eslint-disable-line react-hooks/exhaustive-deps


  // iPhone: the page's video goes into PiP. Android has no PiP for a page's video, so the app window
  // shrinks into PiP and the screen shows only this player (see pip.ts).
  useImperativeHandle(
    ref,
    () => ({ pip: () => (OS.OS === 'android' ? void enterAppPip() : view.current?.injectJavaScript('window.__shPip && window.__shPip(); true;')) }),
    []
  )

  const onMessage = (e: WebViewMessageEvent): void => {
    let msg: { __player?: string; t?: number; d?: number; __twitchAds?: TwitchAdMessage }
    try {
      msg = JSON.parse(e.nativeEvent.data)
    } catch {
      return
    }
    if (msg.__player === 'progress' && typeof msg.t === 'number' && typeof msg.d === 'number') callbacks.current.onProgress?.(msg.t, msg.d)
    else if (msg.__player === 'ended') callbacks.current.onEnded?.()
    else if (msg.__player === 'viewport') console.log(`[player] page viewport ${JSON.stringify(msg)}`)
    else if (msg.__twitchAds) {
      const m = msg.__twitchAds
      console.log(`[twitch ads] ${'mode' in m ? `filtering in: ${m.mode}` : m.log}`)
      const text = 'log' in m ? adNotice(m.log) : null
      if (!text) return
      setNotice(text)
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
      noticeTimer.current = setTimeout(() => setNotice(null), 5000)
    }
  }

  return (
    <View style={[styles.box, style]}>
      <WebView
        ref={view}
        // Turning ad blocking on or off reloads the player with or without the filter.
        key={blockAds ? 'filtered' : 'plain'}
        injectedJavaScriptBeforeContentLoaded={adScript}
        // YouTube's embed refuses to play (error 153) without a referrer naming the embedder.
        source={source ?? { html: '<html><body style="background:#000"></body></html>' }}
        userAgent={playerUserAgent(platform)}
        style={styles.web}
        containerStyle={styles.web}
        injectedJavaScript={script}
        onMessage={onMessage}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        allowsPictureInPictureMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        bounces={false}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        // Links inside a player (channel names, logos) open in the browser instead of replacing it.
        onShouldStartLoadWithRequest={(req) => {
          if (req.isTopFrame === false || !/^https?:/.test(req.url) || hostOf(req.url) === host) return true
          void WebBrowser.openBrowserAsync(req.url)
          return false
        }}
      />
      {/* Not over the small picture-in-picture window, where it would cover much of the video. */}
      {notice && !inPip ? (
        <View style={styles.notice} pointerEvents="none">
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}
    </View>
  )
})

const HlsPlayer = forwardRef<PlayerHandle, Props>(function HlsPlayer({ url, resumeAt = 0, onProgress, onEnded, style }, ref) {
  const videoView = useRef<VideoViewType>(null)
  const player = useVideoPlayer({ uri: url }, (p) => {
    p.timeUpdateEventInterval = 2
    p.staysActiveInBackground = true
    if (resumeAt > 0) p.currentTime = resumeAt
    p.play()
  })
  const { currentTime } = useEvent(player, 'timeUpdate', { currentTime: player.currentTime, bufferedPosition: 0, currentLiveTimestamp: null, currentOffsetFromLive: null })
  // The latest callbacks, for page messages and player events that arrive later.
  const callbacks = useRef({ onProgress, onEnded })
  useEffect(() => {
    callbacks.current = { onProgress, onEnded }
  })

  useEffect(() => {
    if (player.duration > 0) callbacks.current.onProgress?.(currentTime, player.duration)
  }, [currentTime, player])
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => callbacks.current.onEnded?.())
    return () => sub.remove()
  }, [player])

  useImperativeHandle(ref, () => ({ pip: () => void videoView.current?.startPictureInPicture() }), [])

  return (
    <View style={[styles.box, style]}>
      <VideoView ref={videoView} player={player} style={styles.web} nativeControls allowsPictureInPicture startsPictureInPictureAutomatically fullscreenOptions={{ enable: true }} />
    </View>
  )
})

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

const styles = StyleSheet.create({
  box: { backgroundColor: '#000', overflow: 'hidden' },
  web: { flex: 1, backgroundColor: '#000' },
  notice: { position: 'absolute', top: 10, alignSelf: 'center', backgroundColor: '#000c', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  noticeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  casting: { aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  castTitle: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  castDetail: { color: '#fffa', fontSize: 13, textAlign: 'center' },
  castActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4 },
  castAction: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ffffff26', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  castActionText: { color: '#fff', fontSize: 13, fontWeight: '600' }
})
