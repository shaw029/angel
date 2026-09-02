import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_URL ?? '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // Two static entries. The privacy policy is its own page rather than a
      // client route: GitHub Pages serves files, so /privacy.html always
      // resolves without a router or a 404 fallback.
      input: {
        main:    resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'privacy.html'),
      },
    },
  },
})
