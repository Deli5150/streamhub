// The desktop's page scripts, with toString() giving back their source (see scripts/gen-page-scripts.mjs).
// collectYouTubeTab also runs in the app itself, so these stay real functions.
import * as scripts from '../../../src/main/providers/pageScripts'
import { PAGE_SCRIPT_SOURCES } from './pageScripts.generated'

for (const [name, fn] of Object.entries(scripts)) {
  const source = PAGE_SCRIPT_SOURCES[name]
  if (typeof fn === 'function' && source) Object.defineProperty(fn, 'toString', { value: () => source })
}

export * from '../../../src/main/providers/pageScripts'
