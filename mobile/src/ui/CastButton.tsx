import { StyleSheet } from 'react-native'
import { NativeCastButton } from '../../modules/streamhub-cast/src/StreamhubCastModule'
import { GoogleCast } from '../lib/cast'
import { useColors } from './theme'

/**
 * Cast to a TV. On iPhone, Apple's own AirPlay button, which opens the system's device picker and
 * sends the playing video to an Apple TV or AirPlay TV. On Android, the Google Cast button: it lists
 * Chromecasts and Google TVs on the Wi-Fi, and once one is picked the player sends its stream there
 * (lib/cast.ts).
 */
export function CastButton(): React.JSX.Element | null {
  const c = useColors()
  if (GoogleCast) return <GoogleCast.CastButton style={styles.button} tintColor={c.fg} accessibilityLabel="Cast to a TV" />
  if (!NativeCastButton) return null
  return <NativeCastButton style={styles.button} tint={c.fg} activeTint={c.accent} accessibilityLabel="Cast to a TV (AirPlay)" />
}

const styles = StyleSheet.create({
  button: { width: 36, height: 36 }
})
