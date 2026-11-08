import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { WebView } from 'react-native-webview'
import type { Channel, LiveInfo } from '@shared/types'
import { chatUrl } from '@shared/urls'
import { signInToYouTubeWeb } from '../desktop/googleAuth'
import { DESKTOP_UA, GOOGLE_WEB_UA } from '../lib/reader'
import { useColors } from './theme'

/** Where a chat page sends you to sign in; opened as the in-app sign-in instead of the browser. */
const isGoogleSignIn = (url: string): boolean => /^https:\/\/(accounts\.google\.com\/|(www\.|m\.)?youtube\.com\/signin)/.test(url)

/** A live channel's chat page, signed in as you (each platform signs in on its own site in the app). */
export function Chat({ channel, live }: { channel: Channel; live?: LiveInfo }): React.JSX.Element {
  const c = useColors()
  const url = chatUrl(channel, live)
  // Bumped after signing in from the chat, to reload it signed in.
  const [reloads, setReloads] = useState(0)
  if (!url) {
    return (
      <View style={styles.empty}>
        <Text style={{ color: c.fg3 }}>Chat isn’t available for this stream.</Text>
      </View>
    )
  }
  const host = new URL(url).host
  return (
    <WebView
      key={`${url}#${reloads}`}
      source={{ uri: url }}
      // Twitch's popout chat and Rumble's chat popup are desktop pages (Rumble's must also match the
      // page reader for Cloudflare); YouTube's is Google's, which must look like the phone's browser;
      // Kick's works as the WebView is.
      userAgent={channel.platform === 'twitch' || channel.platform === 'rumble' ? DESKTOP_UA : channel.platform === 'youtube' ? GOOGLE_WEB_UA : undefined}
      style={{ flex: 1, backgroundColor: c.bg }}
      containerStyle={{ backgroundColor: c.bg }}
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      domStorageEnabled
      forceDarkOn={c.dark}
      // YouTube's chat page has no phone viewport, so it renders desktop-wide and tiny; this gives it
      // one and a larger base font.
      injectedJavaScriptBeforeContentLoaded={channel.platform === 'youtube' ? YOUTUBE_CHAT_READABLE : undefined}
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(req) => {
        if (channel.platform === 'youtube' && isGoogleSignIn(req.url)) {
          signInToYouTubeWeb().then(
            () => setReloads((n) => n + 1),
            () => undefined
          )
          return false
        }
        if (req.isTopFrame === false || !/^https?:/.test(req.url) || new URL(req.url).host === host) return true
        void WebBrowser.openBrowserAsync(req.url)
        return false
      }}
    />
  )
}

const YOUTUBE_CHAT_READABLE = `(function () {
  var add = function () {
    if (!document.head) return setTimeout(add, 50);
    var m = document.createElement('meta'); m.name = 'viewport'; m.content = 'width=device-width, initial-scale=1';
    document.head.appendChild(m);
    var st = document.createElement('style'); st.textContent = 'html { font-size: 17px !important; } yt-live-chat-text-message-renderer #message, yt-live-chat-text-message-renderer #author-name { font-size: 15px !important; line-height: 1.35 !important; }';
    document.head.appendChild(st);
  };
  add();
})(); true;`

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }
})
