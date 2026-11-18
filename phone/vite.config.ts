import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Eclipse on your phone (Phase 45): a small web page built from src/core plus phone/src, published
 * to GitHub Pages at https://looby758.github.io/Eclipse/. Build with `npm run build:phone`
 * (it lands in phone/dist) or try it with `npm run dev:phone`.
 */
export default defineConfig({
  root: __dirname,
  base: process.env.PHONE_BASE ?? '/Eclipse/',
  plugins: [react()],
  resolve: { alias: { '@core': resolve(__dirname, '../src/core') } },
  server: { port: 5174, strictPort: true },
  build: { outDir: resolve(__dirname, 'dist'), emptyOutDir: true }
})
