// Android: the app's window extends into the camera cutout's edge. Before Android 15, a full-screen
// window otherwise stays clear of it, so in one landscape orientation (cutout on that side) a video
// in full screen sat off-center, with a wide black bar on the cutout's side. Screens already keep
// their own content clear of the cutout with the safe-area insets.
const { withAndroidStyles } = require('expo/config-plugins')

const ATTR = 'android:windowLayoutInDisplayCutoutMode'

module.exports = function withCutoutEdges(config) {
  return withAndroidStyles(config, (c) => {
    const theme = c.modResults.resources.style?.find((s) => s.$.name === 'AppTheme')
    if (theme) {
      theme.item = (theme.item ?? []).filter((i) => i.$.name !== ATTR)
      theme.item.push({ $: { name: ATTR, 'tools:targetApi': '28' }, _: 'shortEdges' })
    }
    return c
  })
}
