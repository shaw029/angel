import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { resolve } from 'path'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  resolve: {
    alias: {
      '@shared':    resolve(__dirname, 'src/shared'),
      '@ui':        resolve(__dirname, 'src/ui'),
      '@ai':        resolve(__dirname, 'src/ai'),
      '@heuristics':resolve(__dirname, 'src/heuristics'),
      '@storage':   resolve(__dirname, 'src/storage'),
      '@memory':    resolve(__dirname, 'src/memory'),
    },
  },
  build: {
    rollupOptions: {
      // offscreen document is not a manifest entry — bundle it as an extra input.
      // Vite preserves source directory structure for HTML entries, so this always
      // outputs to dist/src/offscreen/index.html, matching OFFSCREEN_URL in constants.ts.
      input: {
        offscreen: resolve(__dirname, 'src/offscreen/index.html'),
      },
    },
  },
})
