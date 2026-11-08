import { StyleSheet } from 'react-native'
import { NativeCastButton } from '../../modules/streamhub-cast/src/StreamhubCastModule'
import { useColors } from './theme'

/**
 * Cast to a TV: on iPhone, Apple's own AirPlay button, which opens the system's device picker and
 * sends the playing video to an Apple TV or AirPlay TV. Not shown on Android yet.
 */
export function CastButton(): React.JSX.Element | null {
  const c = useColors()
  if (!NativeCastButton) return null
  return <NativeCastButton style={styles.button} tint={c.fg} activeTint={c.accent} accessibilityLabel="Cast to a TV (AirPlay)" />
}

const styles = StyleSheet.create({
  button: { width: 36, height: 36 }
})
