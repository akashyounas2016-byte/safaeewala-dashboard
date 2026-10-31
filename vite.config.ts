import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5058,
    proxy: {
      // Local testing of user management before the VPS has the new server: start the dev
      // server with LOCAL_ADMIN_API=1 and run `npm run api:local` (reads server.local.env).
      ...(process.env.LOCAL_ADMIN_API ? { '/api/admin': { target: 'http://127.0.0.1:3001', changeOrigin: true } } : {}),
      '/api': {
        target: 'https://crm.srv1646539.hstgr.cloud',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // TA-13: vendor chunks with priorities. With manualChunks the charts group also captured its
        // dependencies — React itself — so every page downloaded ~380 KB of chart code. A higher
        // priority keeps React (and other shared libraries) out of the charts chunk.
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|react-is|use-sync-external-store)[\\/]/, priority: 50 },
            // small helpers shared by the app and the charts (clsx …) — own chunk, loaded at start
            { name: 'vendor-utils', test: /node_modules[\\/](clsx|tailwind-merge|class-variance-authority|sonner)[\\/]/, priority: 45 },
            { name: 'vendor-supabase', test: /node_modules[\\/]@supabase[\\/]/, priority: 40 },
            { name: 'vendor-lucide', test: /node_modules[\\/]lucide-react[\\/]/, priority: 40 },
            { name: 'vendor-xlsx', test: /node_modules[\\/]xlsx[\\/]/, priority: 30 },
            { name: 'vendor-charts', test: /node_modules[\\/](recharts|victory-vendor|d3-[a-z-]+|internmap|decimal\.js-light|es-toolkit|eventemitter3|@reduxjs|immer|react-redux|reselect)[\\/]/, priority: 20 },
          ],
        },
      },
    },
  },
})
