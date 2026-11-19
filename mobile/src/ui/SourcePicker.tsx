import { useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { PLATFORM_LABEL, type Channel } from '@shared/types'
import { Icon } from './Icon'
import { PLATFORM_COLOR, useColors } from './theme'

// Combined channels: a button showing which member's stream (or chat) is in use, opening a dropdown
// of the live members right below it. The watch screen puts the stream's and the chat's side by side.

interface Props {
  label: string
  members: Channel[]
  activeKey: string
  onPick(key: string): void
  /** which edge of the button the dropdown lines up with */
  align?: 'left' | 'right'
  /** take an equal share of the row (the chevron goes to the far end) */
  fill?: boolean
}

const MENU_WIDTH = 220
const ROW_HEIGHT = 48

export function SourcePicker({ label, members, activeKey, onPick, align = 'left', fill = false }: Props): React.JSX.Element {
  const c = useColors()
  const window = useWindowDimensions()
  const button = useRef<React.ComponentRef<typeof View>>(null)
  const [at, setAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const active = members.find((m) => m.key === activeKey) ?? members[0]
  // The platform says which member it is, unless two members are on the same platform.
  const name = members.filter((m) => m.platform === active.platform).length > 1 ? active.displayName : PLATFORM_LABEL[active.platform]

  const open = (): void => button.current?.measureInWindow((x, y, w, h) => setAt({ x, y, w, h }))
  const close = (): void => setAt(null)

  let menuPos: { left: number; top: number; width: number } | null = null
  if (at) {
    const width = Math.max(MENU_WIDTH, at.w)
    const left = align === 'right' ? at.x + at.w - width : at.x
    const height = members.length * ROW_HEIGHT + 8
    // Below the button, or above it when there's no room underneath.
    const below = at.y + at.h + 4
    const top = below + height > window.height - 16 ? Math.max(16, at.y - height - 4) : below
    menuPos = { left: Math.min(Math.max(8, left), window.width - width - 8), top, width }
  }

  return (
    <>
      <Pressable
        ref={button}
        onPress={open}
        style={({ pressed }) => [styles.button, fill && { flex: 1 }, { backgroundColor: c.bg2 }, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={`${label} source: ${name}`}
      >
        <Text style={{ color: c.fg3, fontSize: 12 }}>{label}</Text>
        <View style={[styles.dot, { backgroundColor: PLATFORM_COLOR[active.platform] }]} />
        <Text numberOfLines={1} style={{ color: c.fg, fontWeight: '600', fontSize: 13, flexShrink: 1, flexGrow: fill ? 1 : 0 }}>
          {name}
        </Text>
        <Icon name="chevron-down" size={14} color={c.fg3} />
      </Pressable>
      <Modal visible={Boolean(at)} transparent animationType="fade" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close menu" />
        {menuPos ? (
          <View style={[styles.menu, menuPos, { backgroundColor: c.card, borderColor: c.separator }]}>
            {members.map((m) => {
              const selected = m.key === active.key
              return (
                <Pressable
                  key={m.key}
                  onPress={() => {
                    close()
                    if (!selected) onPick(m.key)
                  }}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.bg2 }]}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.dot, { backgroundColor: PLATFORM_COLOR[m.platform] }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: c.fg, fontSize: 15, fontWeight: selected ? '600' : '400' }}>
                      {PLATFORM_LABEL[m.platform]}
                    </Text>
                    <Text numberOfLines={1} style={{ color: c.fg3, fontSize: 12 }}>
                      {m.displayName}
                    </Text>
                  </View>
                  {selected ? <Icon name="checkmark" size={18} color={c.accent} /> : null}
                </Pressable>
              )
            })}
          </View>
        ) : null}
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, maxWidth: '100%' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  menu: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, height: ROW_HEIGHT, paddingHorizontal: 14 }
})
