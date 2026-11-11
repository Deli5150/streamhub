import { Platform as OS, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { useApp } from '../lib/hub'
import { Icon, type IconName } from './Icon'
import { usePipActive } from './pip'
import { useColors } from './theme'

// Android's floating dock (Settings → Dock → Floating): a rounded bar that floats over the screen
// above the bottom edge, like the iPhone's, instead of Android's full-width navigation bar. Screens
// leave room for it at the bottom (useDockSpace).

/** The tabs, in order, as the dock shows them. */
export const DOCK_TABS: { name: string; label: string; icon: IconName; selected: IconName }[] = [
  { name: 'index', label: 'Live', icon: 'radio-outline', selected: 'radio' },
  { name: 'channels', label: 'Channels', icon: 'people-outline', selected: 'people' },
  { name: 'settings', label: 'Settings', icon: 'settings-outline', selected: 'settings' }
]

const HEIGHT = 64
const MARGIN = 12

/** Space the floating dock takes above the bottom inset. */
export const FLOATING_DOCK_SPACE = HEIGHT + MARGIN + 8

/** Whether this phone shows the floating dock. */
export function useFloatingDock(): boolean {
  const dock = useApp((s) => s.app?.settings.androidDock)
  return OS.OS === 'android' && dock === 'floating'
}

export function FloatingDock({ state, emitter, navigateToTab }: BottomTabBarProps): React.JSX.Element | null {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const inPip = usePipActive()
  const liveCount = useApp((s) => Object.keys(s.app?.live ?? {}).length)
  const accountError = useApp((s) => s.app?.accounts.some((a) => a.error) ?? false)
  if (inPip) return null
  const badges: Record<string, string | undefined> = { index: liveCount ? String(liveCount) : undefined, settings: accountError ? '!' : undefined }

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + MARGIN }]}>
      <View style={[styles.dock, { backgroundColor: c.dark ? 'rgba(40,40,44,0.94)' : 'rgba(250,250,252,0.96)', borderColor: c.separator }]} accessibilityRole="tablist">
        {state.routes.map((route, i) => {
          const tab = DOCK_TABS.find((t) => t.name === route.name)
          if (!tab) return null
          const focused = state.index === i
          const badge = badges[route.name]
          const onPress = (): void => {
            const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
            if (!focused && !e.defaultPrevented) navigateToTab(route.key)
          }
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              style={({ pressed }) => [styles.item, focused && { backgroundColor: c.accent + '26' }, pressed && styles.pressed]}
            >
              <View>
                <Icon name={focused ? tab.selected : tab.icon} size={24} color={focused ? c.accent : c.fg2} />
                {badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.label, { color: focused ? c.accent : c.fg2 }]}>{tab.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  dock: {
    flexDirection: 'row',
    height: HEIGHT,
    padding: 6,
    gap: 4,
    borderRadius: HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 }
  },
  item: { minWidth: 92, borderRadius: (HEIGHT - 12) / 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  pressed: { opacity: 0.7 },
  label: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  badge: { position: 'absolute', top: -4, right: -12, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: '#eb0400', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' }
})
