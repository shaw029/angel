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
      // After build, check dist/ to confirm the output path and update OFFSCREEN_URL.
      input: {
        offscreen: resolve(__dirname, 'src/offscreen/index.html'),
      },
    },
  },
})
