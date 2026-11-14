import { useEffect, useRef, useState } from 'react'
import { Platform as OS, StyleSheet, Text, TextInput, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { WebView } from 'react-native-webview'
import type { Channel, LiveInfo } from '@shared/types'
import { chatUrl } from '@shared/urls'
import { prepareYouTubeChat, sendYouTubeChat } from '../../../src/main/youtubeChat'
import { allowYouTubeChat, googleSignedIn, signInToYouTubeWeb } from '../desktop/googleAuth'
import { DESKTOP_UA, GOOGLE_WEB_UA } from '../lib/reader'
import { IconButton } from './components'
import { useColors } from './theme'

/** Where a chat page sends you to sign in; opened as the in-app sign-in instead of the browser. */
const isGoogleSignIn = (url: string): boolean => /^https:\/\/(accounts\.google\.com\/|(www\.|m\.)?youtube\.com\/signin)/.test(url)

/**
 * iPhone: YouTube's chat page has no sign-in there (YouTube connects through Google's sign-in, which
 * doesn't sign web pages in), so it said "Sign in to chat" (issue #11). Its message box is hidden and
 * StreamHub's own sends as the connected account instead, as on the desktop.
 */
const ownYouTubeBox = (channel: Channel, live?: LiveInfo): live is LiveInfo & { streamId: string } =>
  OS.OS === 'ios' && channel.platform === 'youtube' && Boolean(live?.streamId)

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
  const ownBox = ownYouTubeBox(channel, live)
  const page = (
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
      injectedJavaScriptBeforeContentLoaded={channel.platform === 'youtube' ? YOUTUBE_CHAT_READABLE(ownBox) : undefined}
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
  if (!ownBox) return page
  return (
    <View style={{ flex: 1 }}>
      {page}
      <YouTubeChatBox videoId={live.streamId} />
    </View>
  )
}

/** StreamHub's message box for a YouTube chat: sends through the Data API as the connected account. */
function YouTubeChatBox({ videoId }: { videoId: string }): React.JSX.Element {
  const c = useColors()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  // The chat's id is looked up now, so the first message goes out in one request.
  useEffect(() => void prepareYouTubeChat(videoId), [videoId])
  const current = useRef(videoId)
  current.current = videoId
  /** Clears at once while the message goes out; it comes back with the reason if YouTube turns it down. */
  const send = (): void => {
    const message = text.trim()
    if (!message) return
    setText('')
    setError(null)
    void (async () => {
      let res = await sendYouTubeChat(videoId, message)
      // Connected before chat was added (read-only access): Google asks once for chat, then it sends.
      if (!res.ok && res.reconnect && googleSignedIn()) {
        await allowYouTubeChat()
        res = await sendYouTubeChat(videoId, message)
      }
      return res
    })()
      .catch((e: Error) => ({ ok: false as const, error: e.message }))
      .then((res) => {
        if (res.ok || current.current !== videoId) return
        setError(res.error)
        setText((now) => (now.trim() ? now : message))
      })
  }
  return (
    <View style={[styles.box, { borderTopColor: c.separator, backgroundColor: c.bg }]}>
      {error ? <Text style={{ color: c.fg3, fontSize: 12, paddingHorizontal: 4 }}>{error}</Text> : null}
      <View style={styles.boxRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Chat…"
          placeholderTextColor={c.fg3}
          maxLength={200}
          multiline
          submitBehavior="submit"
          returnKeyType="send"
          onSubmitEditing={send}
          style={[styles.input, { color: c.fg, backgroundColor: c.bg2 }]}
        />
        <IconButton icon="send" label="Send" size={20} color={text.trim() ? c.accent : c.fg3} onPress={send} />
      </View>
    </View>
  )
}

const YOUTUBE_CHAT_READABLE = (hideInput: boolean): string => `(function () {
  var add = function () {
    if (!document.head) return setTimeout(add, 50);
    var m = document.createElement('meta'); m.name = 'viewport'; m.content = 'width=device-width, initial-scale=1';
    document.head.appendChild(m);
    var st = document.createElement('style'); st.textContent = 'html { font-size: 17px !important; } yt-live-chat-text-message-renderer #message, yt-live-chat-text-message-renderer #author-name { font-size: 15px !important; line-height: 1.35 !important; }${
      hideInput ? ' #input-panel, yt-live-chat-message-input-renderer { display: none !important; }' : ''
    }';
    document.head.appendChild(st);
  };
  add();
})(); true;`

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  box: { gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  boxRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  input: { flex: 1, minHeight: 36, maxHeight: 96, borderRadius: 18, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 8, fontSize: 15 }
})
