import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const root = resolve(__dirname, '../..')

/**
 * Standalone build for the store-screenshot harness. Deliberately does NOT use
 * the crx plugin: this renders the real Nudge and popup components as an
 * ordinary web page so headless Chrome can photograph them.
 */
export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      // Real modules.
      '@shared':     resolve(root, 'src/shared'),
      '@ui':         resolve(root, 'src/ui'),
      // Stubs: these reach IndexedDB, which is empty in a screenshot run.
      '@memory/evaluation': resolve(__dirname, 'stubs/memory-evaluation.ts'),
      '@memory/index':      resolve(__dirname, 'stubs/memory-index.ts'),
      '@memory':            resolve(root, 'src/memory'),
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
