import { useState } from 'react'
import { KeyboardAvoidingView, Platform as OS, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import Constants from 'expo-constants'
import { router, useLocalSearchParams } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { feedbackUrl, feedbackWhere, type FeedbackKind } from '@shared/feedback'
import { recentLog } from '../lib/log'
import { Button, Chip, useModalTop } from '../ui/components'
import { useColors } from '../ui/theme'

/**
 * Report a bug or suggest a feature (the desktop's Feedback dialog): written here, then finished on
 * GitHub, where the issue form opens with everything filled in. It opens in the in-app browser: handed
 * to the system, github.com links open the GitHub app, whose new-issue screen keeps only the title.
 */
export default function FeedbackScreen(): React.JSX.Element {
  const c = useColors()
  const modalTop = useModalTop()
  const params = useLocalSearchParams<{ kind?: string }>()
  const [kind, setKind] = useState<FeedbackKind>(params.kind === 'feature' ? 'feature' : 'bug')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [withLog, setWithLog] = useState(true)
  const version = Constants.expoConfig?.version ?? ''
  const where = feedbackWhere(kind, OS.OS)
  const ready = title.trim().length > 0 && text.trim().length > 0

  const send = (): void => {
    const url = feedbackUrl({ kind, title, text, where, version, log: kind === 'bug' && withLog ? recentLog() : undefined })
    router.back()
    void WebBrowser.openBrowserAsync(url)
  }

  const field = [styles.field, { color: c.fg, backgroundColor: c.bg2, borderColor: c.separator }]
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={OS.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.bar, { borderBottomColor: c.separator }, modalTop]}>
        <Button title="Cancel" variant="plain" onPress={() => router.back()} />
        <Text style={{ color: c.fg, fontWeight: '700', fontSize: 17, flex: 1, textAlign: 'center' }}>Send feedback</Text>
        <Button title="Continue" variant="plain" disabled={!ready} onPress={send} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: c.fg3, fontSize: 13, lineHeight: 18 }}>
          Your report opens on GitHub with everything filled in. Check it over there and submit it (you’ll need a free GitHub account).
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Report a bug" active={kind === 'bug'} onPress={() => setKind('bug')} />
          <Chip label="Suggest a feature" active={kind === 'feature'} onPress={() => setKind('feature')} />
        </View>
        <TextInput
          autoFocus
          value={title}
          onChangeText={setTitle}
          placeholder={kind === 'bug' ? 'In a few words, what went wrong?' : 'In a few words, what should StreamHub do?'}
          placeholderTextColor={c.fg3}
          maxLength={120}
          returnKeyType="next"
          style={field}
        />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={kind === 'bug' ? 'What you did, what you expected, and what happened instead.' : 'Describe the idea, and how you’d use it.'}
          placeholderTextColor={c.fg3}
          multiline
          textAlignVertical="top"
          style={[field, { minHeight: 150 }]}
        />
        {kind === 'bug' ? (
          <View style={styles.logRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.fg, fontWeight: '600', fontSize: 15 }}>Include the recent app log</Text>
              <Text style={{ color: c.fg3, fontSize: 12, lineHeight: 16 }}>
                Helps track the problem down. Sign-in tokens, emails and the like are taken out, and you can read it on GitHub before sending.
              </Text>
            </View>
            <Switch value={withLog} onValueChange={setWithLog} accessibilityLabel="Include the recent app log" />
          </View>
        ) : null}
        <Text style={{ color: c.fg3, fontSize: 12 }}>
          StreamHub {version} · {where.join(', ')}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  field: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }
})
