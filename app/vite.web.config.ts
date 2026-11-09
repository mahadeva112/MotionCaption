// The renderer alone in a browser (no Electron), for UI work. devApi.ts stands in for the preload.
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve('src/renderer'),
  resolve: { alias: { '@core': resolve('src/core') } },
  plugins: [react()],
  server: { port: 5180, strictPort: true },
})
