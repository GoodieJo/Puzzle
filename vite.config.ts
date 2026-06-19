import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.png'],
      manifest: {
        id: '/',
        name: 'Piecewise - Jigsaw Puzzles',
        short_name: 'Piecewise',
        description: 'A smooth, mobile-first jigsaw puzzle game. Play solo or with friends in real time.',
        theme_color: '#1b2430',
        background_color: '#faf5ec',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'puzzle-images',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true, ws: true },
      '/r2':  { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
});