import { useEffect, useState } from 'react'
import { Keyboard, LayoutAnimation, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * How much of the bottom of the screen the on-screen keyboard covers (0 while it's closed),
 * including the home-indicator / navigation-bar area under it. Screens pad by this so what's being
 * typed into (e.g. a chat page's message box) stays above the keyboard: the app draws edge to edge,
 * so neither system shrinks the screen for it.
 */
export function useKeyboardCover(): number {
  const insets = useSafeAreaInsets()
  const [height, setHeight] = useState(0)
  useEffect(() => {
    // iOS animates alongside the keyboard; Android only reports once it has moved.
    const ios = Platform.OS === 'ios'
    const animate = (): void => {
      if (ios) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    }
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      animate()
      setHeight(e.endCoordinates.height)
    })
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      animate()
      setHeight(0)
    })
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])
  if (!height) return 0
  // iOS's keyboard height includes the home-indicator area; Android's leaves out the navigation bar.
  return Platform.OS === 'ios' ? height : height + insets.bottom
}
