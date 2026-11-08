import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: { resolve: { alias: shared } },
  preload: {
    resolve: { alias: shared },
    // The app's preload, and the picture-in-picture window's (its controls).
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts'), pip: resolve(__dirname, 'src/preload/pip.ts') } } }
  },
  renderer: {
    resolve: { alias: shared },
    plugins: [react(), tailwindcss()]
  }
})
