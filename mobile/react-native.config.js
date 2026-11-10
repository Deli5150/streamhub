// react-native-google-cast is Android only here (see plugins/withAndroidCast.js): iPhone casts with
// AirPlay, so the library isn't linked into the iOS app.
module.exports = {
  dependencies: {
    'react-native-google-cast': { platforms: { ios: null } }
  }
}
