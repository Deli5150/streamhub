import { useState } from 'react'
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { PLATFORM_LABEL } from '@shared/types'
import { useLogin } from '../lib/login'
import { readerUserAgent } from '../lib/reader'
import { Button } from './components'
import { useColors } from './theme'

// The sign-in screen (the desktop's sign-in window): the platform's own login page. It closes by
// itself once the sign-in is detected; "Done" closes it after one last check.

export function LoginSheet(): React.JSX.Element {
  const request = useLogin((s) => s.request)
  const c = useColors()
  const [loading, setLoading] = useState(true)
  const close = (): void => request?.onClose()
  // Same browser identity as the page reader, since Cloudflare ties its clearance to it (Twitch
  // isn't behind Cloudflare and keeps the phone-sized login page).
  const userAgent = request ? (request.userAgent ?? (request.platform === 'twitch' ? undefined : readerUserAgent(request.platform))) : undefined
  return (
    <Modal visible={Boolean(request)} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView edges={['top', 'bottom']} style={[styles.root, { backgroundColor: c.bg }]}>
        <View style={[styles.bar, { borderBottomColor: c.separator }]}>
          <Text style={[styles.title, { color: c.fg }]}>{request ? `Sign in to ${PLATFORM_LABEL[request.platform]}` : ''}</Text>
          {loading ? <ActivityIndicator color={c.fg3} /> : null}
          <Button title="Done" variant="plain" onPress={close} />
        </View>
        {request ? (
          <WebView
            key={request.url}
            source={{ uri: request.url }}
            userAgent={userAgent}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => {
              setLoading(false)
              request.onNavigate()
            }}
            onNavigationStateChange={() => request.onNavigate()}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            domStorageEnabled
            javaScriptCanOpenWindowsAutomatically
            setSupportMultipleWindows={false}
            style={{ flex: 1 }}
          />
        ) : null}
        <Text style={[styles.note, { color: c.fg3 }]}>Your sign-in stays on this phone. StreamHub only reads the channels you follow.</Text>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 4, height: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, fontSize: 17, fontWeight: '600' },
  note: { fontSize: 12, textAlign: 'center', padding: 8 }
})
