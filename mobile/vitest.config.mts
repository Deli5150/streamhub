import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = dirname(fileURLToPath(import.meta.url))

// The mobile app's own tests, plus the desktop's parser tests run the way the phone runs the parsers
// (cheerio's slim build, which leaves out cheerio's Node-only networking).
export default defineConfig({
  resolve: {
    alias: [
      { find: '@shared', replacement: resolve(here, '../src/shared') },
      { find: /^cheerio$/, replacement: resolve(here, 'node_modules/cheerio/dist/esm/slim.js') }
    ]
  },
  test: { root: resolve(here, '..'), include: ['mobile/tests/**/*.test.ts', 'tests/parsers.test.ts', 'tests/twitchAdFilter.test.ts'] }
})
