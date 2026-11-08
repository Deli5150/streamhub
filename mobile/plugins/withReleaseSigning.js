// Android release builds are signed with StreamHub's own key (mobile/credentials/, never uploaded)
// when its details are in ~/.gradle/gradle.properties (STREAMHUB_RELEASE_*), so every APK can install
// over the last one. Without them, Expo's default debug signing applies.
const { withAppBuildGradle } = require('expo/config-plugins')

const SIGNING = `
        release {
            if (project.hasProperty('STREAMHUB_RELEASE_STORE_FILE')) {
                storeFile file(STREAMHUB_RELEASE_STORE_FILE)
                storePassword STREAMHUB_RELEASE_STORE_PASSWORD
                keyAlias STREAMHUB_RELEASE_KEY_ALIAS
                keyPassword STREAMHUB_RELEASE_KEY_PASSWORD
            }
        }`

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    let gradle = c.modResults.contents
    if (!gradle.includes('STREAMHUB_RELEASE_STORE_FILE')) {
      // Add the release signing config next to the debug one...
      gradle = gradle.replace(/(signingConfigs \{\s*debug \{[^}]*\})/, `$1${SIGNING}`)
      // ...and use it for release builds when it's set up.
      gradle = gradle.replace(
        /(release \{[^{}]*?)signingConfig signingConfigs\.debug/,
        "$1signingConfig project.hasProperty('STREAMHUB_RELEASE_STORE_FILE') ? signingConfigs.release : signingConfigs.debug"
      )
    }
    c.modResults.contents = gradle
    return c
  })
}
