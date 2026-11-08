import { NativeModule, requireOptionalNativeModule } from 'expo'

// Android-only (see android/…/StreamhubPipModule.kt); null on iPhone, where it isn't needed.
declare class StreamhubPipModule extends NativeModule {
  isSupported(): boolean
  isActive(): boolean
  enter(width: number, height: number): Promise<boolean>
  setAutoEnter(enabled: boolean, width: number, height: number): Promise<boolean>
}

export default requireOptionalNativeModule<StreamhubPipModule>('StreamhubPip')
