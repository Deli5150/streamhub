// Xcode's Run button (⌘R) builds the Release configuration: the standalone app with its JavaScript
// built in, which keeps working away from this Mac. That's how the iPhone app is installed with a
// free Apple ID (see README → iPhone with a free Apple ID). `npx expo run:ios` picks its own.
const fs = require('fs')
const path = require('path')
const { withDangerousMod } = require('expo/config-plugins')

module.exports = function withReleaseRunScheme(config) {
  return withDangerousMod(config, [
    'ios',
    (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, `${c.modRequest.projectName}.xcodeproj`, 'xcshareddata', 'xcschemes')
      for (const file of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
        const scheme = path.join(dir, file)
        const text = fs.readFileSync(scheme, 'utf8')
        fs.writeFileSync(scheme, text.replace(/(<LaunchAction\s+buildConfiguration\s*=\s*")Debug(")/, '$1Release$2'))
      }
      return c
    }
  ])
}
