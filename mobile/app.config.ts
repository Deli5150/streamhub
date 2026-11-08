import type { ExpoConfig } from 'expo/config'
import desktop from '../package.json'

// YouTube sign-in uses Google OAuth clients from your Google Cloud project (see README → YouTube
// sign-in on mobile). The iOS client's reversed ID is the URL scheme Google sends you back on.
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? ''
const iosUrlScheme = iosClientId ? `com.googleusercontent.apps.${iosClientId.replace(/\.apps\.googleusercontent\.com$/, '')}` : ''

// Bundle IDs are unique across every Apple account. If Xcode says this one is taken when you sign
// with your own Apple ID, set STREAMHUB_IOS_BUNDLE_ID (e.g. com.yourname.streamhub) and build again.
const iosBundleId = process.env.STREAMHUB_IOS_BUNDLE_ID || 'app.streamhub'

const config: ExpoConfig = {
  name: 'StreamHub',
  slug: 'streamhub',
  version: desktop.version,
  scheme: 'streamhub',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#000000',
  ios: {
    bundleIdentifier: iosBundleId,
    // Your Apple team for signing (a free Apple ID's Personal Team works); kept in mobile/.env.
    ...(process.env.STREAMHUB_APPLE_TEAM_ID ? { appleTeamId: process.env.STREAMHUB_APPLE_TEAM_ID } : {}),
    supportsTablet: true,
    infoPlist: {
      // Live-status checks while the app is in the background (see src/lib/background.ts).
      UIBackgroundModes: ['audio', 'fetch', 'processing'],
      ITSAppUsesNonExemptEncryption: false
    }
  },
  android: {
    package: 'app.streamhub',
    adaptiveIcon: {
      backgroundColor: '#0d1117',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png'
    },
    predictiveBackGestureEnabled: false,
    permissions: ['POST_NOTIFICATIONS']
  },
  plugins: [
    // Lets a free Apple ID sign the app (see the plugin). Listed first because Expo applies
    // entitlement changes in reverse order, so this one runs after expo-notifications'.
    './plugins/withoutPushEntitlement',
    './plugins/withReleaseRunScheme',
    './plugins/withReleaseSigning',
    './plugins/withoutCodeShrinking',
    'expo-router',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 160, backgroundColor: '#0d1117' }],
    ['expo-video', { supportsBackgroundPlayback: true, supportsPictureInPicture: true }],
    'expo-background-task',
    ['expo-notifications', { color: '#2f81f7' }],
    'expo-web-browser',
    'expo-image',
    // Wallpapers come from the photo library; the camera and microphone are never used.
    ['expo-image-picker', { photosPermission: 'StreamHub uses the photos you pick as wallpapers.', cameraPermission: false, microphonePermission: false }],
    'expo-screen-orientation',
    '@preeternal/react-native-cookie-manager',
    ...(iosUrlScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme }] as [string, unknown]] : [])
  ],
  experiments: { typedRoutes: true }
}

export default config
