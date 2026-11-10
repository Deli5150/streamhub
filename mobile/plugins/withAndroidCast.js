// Chromecast and Google TV casting on Android: react-native-google-cast's Android setup (Google's
// Cast framework, its options provider, lazy loading in MainActivity) with Google's Default Media
// Receiver, which plays a stream's own HLS or MP4 link on the TV. iPhone casts with AirPlay instead,
// so the library's iOS half (its plugin and the Google Cast SDK pod) is left out entirely; see
// react-native.config.js.
const { withAndroidGoogleCast } = require('react-native-google-cast/lib/commonjs/plugin/withAndroidGoogleCast')

const DEFAULT_MEDIA_RECEIVER = 'CC1AD845'
// Pinned: the library otherwise takes the newest Cast framework, and 23.x is built with a newer
// Kotlin than this React Native version compiles with.
const CAST_FRAMEWORK_VERSION = '22.3.1'

module.exports = function withAndroidCast(config) {
  return withAndroidGoogleCast(config, { receiverAppId: DEFAULT_MEDIA_RECEIVER, expandedController: true, androidPlayServicesCastFrameworkVersion: CAST_FRAMEWORK_VERSION })
}
