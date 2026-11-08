import { NativeTabs } from 'expo-router/native-tabs'
import { useApp } from '../../lib/hub'
import { usePipActive } from '../../ui/pip'
import { useColors } from '../../ui/theme'

/**
 * The dock: the system's own tab bar, which on iOS 26+ is Apple's floating Liquid Glass bar (it
 * shrinks while you scroll down a list), and Android's Material navigation bar. Screens that hide it
 * (a stream, a channel page, Watch Later) show a home button instead (ui/HomeButton.tsx).
 */
export default function TabsLayout(): React.JSX.Element {
  const c = useColors()
  const liveCount = useApp((s) => Object.keys(s.app?.live ?? {}).length)
  const accountError = useApp((s) => s.app?.accounts.some((a) => a.error) ?? false)
  // Android picture-in-picture shows only the player.
  const inPip = usePipActive()
  return (
    <NativeTabs tintColor={c.accent} badgeBackgroundColor="#eb0400" minimizeBehavior="onScrollDown" hidden={inPip} disableHiddenAnimation>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="dot.radiowaves.left.and.right" md="sensors" />
        <NativeTabs.Trigger.Label>Live</NativeTabs.Trigger.Label>
        {/* Only added when there's a count: Android's tab bar shows badges even when marked hidden. */}
        {liveCount ? <NativeTabs.Trigger.Badge>{String(liveCount)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="channels">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md="group" />
        <NativeTabs.Trigger.Label>Channels</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        {accountError ? <NativeTabs.Trigger.Badge>!</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
