// Alternate app icons (modules/app-icons): puts every icon in assets/app-icons into the native app.
//   Android: an <activity-alias> of MainActivity per icon (MainActivity's own launcher entry moves
//   to a "default" alias), each with an adaptive icon made from assets/app-icons/android/<id>.png.
//   iPhone: an AppIcon-<id> icon set per icon in the asset catalogue (from full/<id>.png), with
//   ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS so Xcode lists them as alternate icons.
const fs = require('fs')
const path = require('path')
const { withAndroidManifest, withDangerousMod, withXcodeProject, IOSConfig } = require('expo/config-plugins')

const ICONS = 'assets/app-icons'
const androidName = (id) => `app_icon_${id.replace(/-/g, '_')}`

function iconIds(projectRoot) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, ICONS, 'icons.json'), 'utf8')).map((i) => i.id).filter((id) => id !== 'default')
}

const launcher = { action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }], category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }] }
const isLauncher = (f) => f.action?.some((a) => a.$['android:name'] === 'android.intent.action.MAIN') && f.category?.some((c) => c.$['android:name'] === 'android.intent.category.LAUNCHER')

function withAndroid(config) {
  config = withDangerousMod(config, ['android', (c) => {
    const res = path.join(c.modRequest.platformProjectRoot, 'app/src/main/res')
    for (const dir of ['drawable-nodpi', 'mipmap-nodpi', 'mipmap-anydpi-v26']) fs.mkdirSync(path.join(res, dir), { recursive: true })
    for (const id of iconIds(c.modRequest.projectRoot)) {
      const name = androidName(id)
      const png = path.join(c.modRequest.projectRoot, ICONS, 'android', `${id}.png`)
      fs.copyFileSync(png, path.join(res, 'drawable-nodpi', `${name}_bg.png`))
      fs.copyFileSync(png, path.join(res, 'mipmap-nodpi', `${name}.png`))
      fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', `${name}.xml`), `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@drawable/${name}_bg"/>\n  <foreground android:drawable="@android:color/transparent"/>\n</adaptive-icon>\n`)
    }
    return c
  }])
  return withAndroidManifest(config, (c) => {
    const appEl = c.modResults.manifest.application[0]
    const main = appEl.activity.find((a) => a.$['android:name'] === '.MainActivity')
    main['intent-filter'] = (main['intent-filter'] ?? []).filter((f) => !isLauncher(f))
    const alias = (id, icon, enabled) => ({
      $: { 'android:name': `.AppIcon_${id.replace(/-/g, '_')}`, 'android:targetActivity': '.MainActivity', 'android:icon': icon, 'android:roundIcon': icon, 'android:enabled': String(enabled), 'android:exported': 'true' },
      'intent-filter': [launcher]
    })
    appEl['activity-alias'] = [alias('default', '@mipmap/ic_launcher', true), ...iconIds(c.modRequest.projectRoot).map((id) => alias(id, `@mipmap/${androidName(id)}`, false))]
    return c
  })
}

function withIos(config) {
  config = withDangerousMod(config, ['ios', (c) => {
    const name = IOSConfig.XcodeUtils.getProjectName(c.modRequest.projectRoot)
    const catalog = path.join(c.modRequest.platformProjectRoot, name, 'Images.xcassets')
    for (const id of iconIds(c.modRequest.projectRoot)) {
      const set = path.join(catalog, `AppIcon-${id}.appiconset`)
      fs.mkdirSync(set, { recursive: true })
      fs.copyFileSync(path.join(c.modRequest.projectRoot, ICONS, 'full', `${id}.png`), path.join(set, 'icon.png'))
      fs.writeFileSync(path.join(set, 'Contents.json'), JSON.stringify({ images: [{ filename: 'icon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2))
    }
    return c
  }])
  return withXcodeProject(config, (c) => {
    const configs = c.modResults.pbxXCBuildConfigurationSection()
    for (const k of Object.keys(configs)) {
      const bs = configs[k].buildSettings
      if (bs && bs.PRODUCT_NAME) bs.ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = 'YES'
    }
    return c
  })
}

module.exports = function withAppIcons(config, { ios = true } = {}) {
  config = withAndroid(config)
  return ios ? withIos(config) : config
}
