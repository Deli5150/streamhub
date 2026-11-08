import { Platform } from 'react-native'
import { requireNativeView } from 'expo'
import type { ColorValue, ViewProps } from 'react-native'

// iPhone-only (see ios/StreamhubCastModule.swift); null elsewhere.
export interface CastButtonProps extends ViewProps {
  tint?: ColorValue
  activeTint?: ColorValue
}

export const NativeCastButton = Platform.OS === 'ios' ? requireNativeView<CastButtonProps>('StreamhubCast') : null
