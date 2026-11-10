import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Icon } from './Icon'
import { create } from 'zustand'
import { useColors } from './theme'

// Bottom action sheet (the desktop's right-click menus). showMenu() from anywhere; <MenuSheet /> is
// mounted once in the root layout.

export interface MenuItem {
  label: string
  sublabel?: string
  icon?: keyof typeof Ionicons.glyphMap
  destructive?: boolean
  disabled?: boolean
  onSelect(): void
}

interface MenuState {
  menu: { title?: string; items: (MenuItem | 'separator')[] } | null
}

const useMenu = create<MenuState>(() => ({ menu: null }))

export const showMenu = (title: string | undefined, items: (MenuItem | 'separator')[]): void => useMenu.setState({ menu: { title, items } })
const close = (): void => useMenu.setState({ menu: null })

export function MenuSheet(): React.JSX.Element {
  const menu = useMenu((s) => s.menu)
  const c = useColors()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={Boolean(menu)} transparent animationType="fade" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close menu" />
      <View style={[styles.sheet, { backgroundColor: c.card, paddingBottom: insets.bottom + 8 }]}>
        {menu?.title ? (
          <Text numberOfLines={1} style={[styles.title, { color: c.fg3, borderBottomColor: c.separator }]}>
            {menu.title}
          </Text>
        ) : null}
        <ScrollView bounces={false}>
          {menu?.items.map((item, i) =>
            item === 'separator' ? (
              <View key={`sep${i}`} style={[styles.separator, { backgroundColor: c.separator }]} />
            ) : (
              <Pressable
                key={`${item.label}${i}`}
                disabled={item.disabled}
                onPress={() => {
                  close()
                  // Let the sheet start closing before the action opens a screen or another sheet.
                  setTimeout(item.onSelect, 50)
                }}
                style={({ pressed }) => [styles.item, pressed && { backgroundColor: c.bg2 }, item.disabled && { opacity: 0.35 }]}
                accessibilityRole="button"
              >
                {item.icon ? <Icon name={item.icon} size={20} color={item.destructive ? c.danger : c.fg2} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: item.destructive ? c.danger : c.fg, fontSize: 16 }}>{item.label}</Text>
                  {item.sublabel ? <Text style={{ color: c.fg3, fontSize: 12 }}>{item.sublabel}</Text> : null}
                </View>
              </Pressable>
            )
          )}
        </ScrollView>
        <Pressable onPress={close} style={[styles.cancel, { backgroundColor: c.bg2 }]} accessibilityRole="button">
          <Text style={{ color: c.fg, fontWeight: '600', fontSize: 16 }}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '75%', paddingTop: 6 },
  title: { fontSize: 13, fontWeight: '600', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, textAlign: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 13 },
  separator: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  cancel: { marginHorizontal: 12, marginTop: 8, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }
})
