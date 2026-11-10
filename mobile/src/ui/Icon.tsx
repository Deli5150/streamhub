import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import type { StyleProp, TextStyle } from 'react-native'
import { useColors } from './theme'

// Every icon in the app goes through here. The Pixel themes draw Material icons (Android's own set)
// in place of Ionicons; the other themes keep Ionicons. Names are Ionicons' (unmapped ones, brand
// logos for one, stay Ionicons in every theme).

export type IconName = keyof typeof Ionicons.glyphMap

const MATERIAL: Partial<Record<IconName, keyof typeof MaterialIcons.glyphMap>> = {
  add: 'add',
  'add-circle-outline': 'add-circle-outline',
  'albums-outline': 'picture-in-picture-alt',
  'alert-circle-outline': 'error-outline',
  'arrow-down': 'arrow-downward',
  'arrow-up': 'arrow-upward',
  'arrow-up-circle': 'arrow-circle-up',
  bookmark: 'bookmark',
  'bookmark-outline': 'bookmark-border',
  'bug-outline': 'bug-report',
  'bulb-outline': 'lightbulb-outline',
  checkmark: 'check',
  'checkmark-circle': 'check-circle',
  'chatbubble-outline': 'chat-bubble-outline',
  'chevron-back': 'arrow-back',
  'chevron-down': 'expand-more',
  'chevron-forward': 'chevron-right',
  close: 'close',
  'cloud-offline-outline': 'cloud-off',
  'download-outline': 'download',
  'ellipsis-horizontal': 'more-horiz',
  'ellipsis-vertical': 'more-vert',
  'film-outline': 'movie',
  'git-branch-outline': 'call-split',
  home: 'home',
  'hourglass-outline': 'hourglass-empty',
  'image-outline': 'image',
  list: 'list',
  'moon-outline': 'dark-mode',
  'notifications-off-outline': 'notifications-off',
  'open-outline': 'open-in-new',
  'people-outline': 'people-outline',
  'phone-portrait-outline': 'smartphone',
  'play-outline': 'play-arrow',
  'play-skip-back': 'skip-previous',
  'play-skip-forward': 'skip-next',
  radio: 'sensors',
  'radio-outline': 'sensors',
  refresh: 'refresh',
  'remove-circle-outline': 'remove-circle-outline',
  settings: 'settings',
  trash: 'delete',
  'trash-outline': 'delete-outline',
  'tv-outline': 'tv',
  'videocam-outline': 'videocam',
  warning: 'warning'
}

export function Icon({ name, size, color, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }): React.JSX.Element {
  const material = useColors().style === 'pixel' ? MATERIAL[name] : undefined
  return material ? <MaterialIcons name={material} size={size} color={color} style={style} /> : <Ionicons name={name} size={size} color={color} style={style} />
}
