// Android release builds skip R8 code shrinking. Expo's template turns it on, and it strips classes
// that libraries create by reflection at startup (WorkManager's database, used by the background
// live check, crashed the app before it could open). A somewhat larger APK is the trade-off.
const { withGradleProperties } = require('expo/config-plugins')

const OFF = { 'android.enableMinifyInReleaseBuilds': 'false', 'android.enableShrinkResourcesInReleaseBuilds': 'false' }

module.exports = function withoutCodeShrinking(config) {
  return withGradleProperties(config, (c) => {
    for (const [key, value] of Object.entries(OFF)) {
      const existing = c.modResults.find((p) => p.type === 'property' && p.key === key)
      if (existing) existing.value = value
      else c.modResults.push({ type: 'property', key, value })
    }
    return c
  })
}
