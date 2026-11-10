import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    // Electron's built-in module (Node's fs without .asar support), used by the updater.
    build: { rollupOptions: { external: ['original-fs'] } }
  },
  preload: {
    resolve: { alias: shared },
    // The app's preload, the picture-in-picture window's (its controls), and the hidden page readers'.
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          pip: resolve(__dirname, 'src/preload/pip.ts'),
          reader: resolve(__dirname, 'src/preload/reader.ts')
        }
      }
    }
  },
  renderer: {
    resolve: { alias: shared },
    plugins: [react(), tailwindcss()]
  }
})
