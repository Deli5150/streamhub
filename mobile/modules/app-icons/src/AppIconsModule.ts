import { NativeModule, requireOptionalNativeModule } from 'expo'

// The launcher / home-screen icon (android/…/AppIconsModule.kt, ios/AppIconsModule.swift). The
// alternates are put in the app by plugins/withAppIcons.js. Null on desktop.
declare class AppIconsModule extends NativeModule {
  /** The icon showing now: "default" or an alternate's id. */
  current(): string
  /** Switches the icon. On iPhone the system says so in a short alert; Android switches without one. */
  set(id: string): Promise<boolean>
}

export default requireOptionalNativeModule<AppIconsModule>('AppIcons')
