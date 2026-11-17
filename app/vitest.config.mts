import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// The renderer's modules import the shared code as @core (as electron.vite.config.ts does)
export default defineConfig({
  resolve: { alias: { '@core': resolve('src/core') } },
})
