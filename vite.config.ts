/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'

/**
 * Configuration baked into the packaged main-process bundle.
 *
 * A packaged app has no `.env` next to it (the file is gitignored and never
 * shipped) and its working directory is not the project root, so `dotenv` finds
 * nothing at runtime and startup used to abort with "JWT_SECRET is not
 * configured". We therefore snapshot a fixed whitelist of keys at build time —
 * from the build machine's `.env` and/or the build environment (CI secrets) —
 * and inline them. At runtime a real `.env` still wins; these are the fallback.
 *
 * The whitelist is deliberate: build-only credentials such as GH_TOKEN must
 * never end up inside the shipped bundle.
 */
const BAKED_ENV_KEYS = [
  'JWT_SECRET',
  'MONGO_URI',
  'SEED_ADMIN_USERNAME',
  'SEED_ADMIN_PASSWORD',
  'IMPORT_DEFAULT_YEAR',
  'CLOUDINARY_URL',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const

function collectBuildEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, '.env')
  const fromFile = fs.existsSync(envPath)
    ? dotenv.parse(fs.readFileSync(envPath))
    : {}

  const out: Record<string, string> = {}
  for (const key of BAKED_ENV_KEYS) {
    // The build environment (e.g. GitHub Actions secrets) wins over the local file.
    const value = process.env[key]?.trim() || fromFile[key]?.trim()
    if (value) out[key] = value
  }
  return out
}

export default defineConfig({
  // Playwright owns tests/e2e (run via `npm run test:e2e`); keep them out of Vitest.
  test: {
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    electron([
      {
        // Main process entry file of the Electron App.
        entry: 'electron/main.ts',
        onstart(options) {
          options.startup()
        },
        vite: {
          define: {
            __BUILD_ENV__: JSON.stringify(collectBuildEnv()),
          },
          build: {
            sourcemap: true,
            minify: false,
            outDir: 'dist-electron',
            rollupOptions: {
              external: [
                'mongoose',
                'exceljs',
                'pdfmake'
              ]
            }
          },
          // Watch all electron source files so any IPC/service change restarts the app
          plugins: [{
            name: 'watch-electron',
            configureServer(server) {
              server.watcher.add('electron/**/*.ts')
            }
          }]
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            sourcemap: true,
            minify: false,
            outDir: 'dist-electron',
            // Electron's sandboxed renderer only supports a CommonJS preload.
            // The package is `"type": "module"`, so force a CJS build emitted as
            // `.cjs` (unambiguously CommonJS regardless of package "type").
            lib: {
              entry: path.resolve(__dirname, 'electron/preload.ts'),
              formats: ['cjs'],
              fileName: () => 'preload.cjs',
            },
          }
        }
      }
    ])
  ],
})
