// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Refresh the saved page-script sources from the desktop's pageScripts.ts before every bundle (see
// scripts/gen-page-scripts.mjs), so a change there can't ship stale.
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'scripts/gen-page-scripts.mjs')], { stdio: 'ignore' })

// The app reuses the desktop app's code in ../src (shared types, the site readers and parsers, and
// the platform providers). The providers' Electron-only imports are swapped for the mobile
// versions in src/desktop, so the same provider files run in both apps.
const DESKTOP_SRC = path.resolve(__dirname, '../src')
const DESKTOP_MAIN = path.join(DESKTOP_SRC, 'main')
const SHIMS = path.resolve(__dirname, 'src/desktop')
const SHIMMED = {
  [path.join(DESKTOP_MAIN, 'net')]: 'net.ts',
  [path.join(DESKTOP_MAIN, 'hidden')]: 'hidden.ts',
  [path.join(DESKTOP_MAIN, 'store')]: 'store.ts',
  [path.join(DESKTOP_MAIN, 'googleAuth')]: 'googleAuth.ts',
  [path.join(DESKTOP_MAIN, 'providers/types')]: 'providerTypes.ts',
  [path.join(DESKTOP_MAIN, 'providers/pageScripts')]: 'pageScripts.ts'
}

config.watchFolders = [DESKTOP_SRC]
// Packages always come from the mobile app, never the desktop app's node_modules (Electron builds).
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')]
config.resolver.blockList = [new RegExp(`^${path.resolve(__dirname, '../node_modules').replace(/[/\\.]/g, '\\$&')}[/\\\\].*`)]

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath
  if (origin.startsWith(DESKTOP_MAIN) && moduleName.startsWith('.')) {
    const shim = SHIMMED[path.resolve(path.dirname(origin), moduleName)]
    if (shim) return { type: 'sourceFile', filePath: path.join(SHIMS, shim) }
  }
  if (moduleName === '@shared' || moduleName.startsWith('@shared/')) {
    return context.resolveRequest(context, path.join(DESKTOP_SRC, 'shared', moduleName.slice('@shared/'.length)), platform)
  }
  // cheerio's default entry pulls in Node-only networking; the parsers only need its HTML core.
  if (moduleName === 'cheerio') return context.resolveRequest(context, 'cheerio/slim', platform)
  if (origin.startsWith(DESKTOP_SRC) && !moduleName.startsWith('.')) {
    // Bare imports from desktop files resolve as if they were made from inside the mobile app.
    return context.resolveRequest({ ...context, originModulePath: path.join(__dirname, 'index.js') }, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
