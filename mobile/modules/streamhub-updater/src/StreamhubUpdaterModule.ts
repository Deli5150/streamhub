import { NativeModule, requireOptionalNativeModule } from 'expo'

// Android-only (see android/…/StreamhubUpdaterModule.kt); null on iPhone, which can't install apps itself.
declare class StreamhubUpdaterModule extends NativeModule {
  canInstall(): boolean
  openInstallSettings(): boolean
  install(path: string): boolean
}

export default requireOptionalNativeModule<StreamhubUpdaterModule>('StreamhubUpdater')
