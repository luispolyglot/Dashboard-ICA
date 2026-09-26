import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

const buildId = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || String(Date.now())
const builtAt = new Date().toISOString()

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'write-version-json',
      apply: 'build',
      closeBundle() {
        const outFile = path.resolve(__dirname, 'dist/version.json')
        fs.writeFileSync(
          outFile,
          JSON.stringify({ buildId, builtAt }, null, 2),
          'utf-8',
        )
      },
    },
  ],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      path: 'path-browserify',
    },
  },
})
