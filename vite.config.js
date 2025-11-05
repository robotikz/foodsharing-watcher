import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  // Explicitly load environment variables based on mode
  // This ensures .env.[mode] files are properly loaded
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico'],
        manifest: {
          name: 'Foodsharing Pickup Watcher',
          short_name: 'Foodsharing',
          description: 'Monitor Foodsharing pickup slots and get notified when free slots become available',
          theme_color: '#0f172a',
          background_color: '#f8fafc',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/icons/pwa-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: '/icons/pwa-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/foodsharing\.de\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'foodsharing-api-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 // 1 hour
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: false // Disable PWA in dev mode for faster development
        }
      })
    ],
    server: {
      port: 5173,
      strictPort: true
    },
    build: {
      sourcemap: true,
      minify: false
    },
    // Vite automatically loads environment files based on mode:
    // - .env (loaded in all cases)
    // - .env.local (loaded in all cases, ignored by git)
    // - .env.[mode] (loaded when --mode [mode] is specified)
    // - .env.[mode].local (loaded when --mode [mode] is specified, ignored by git)
    // Variables prefixed with VITE_ are exposed to the client
    // Using loadEnv above ensures proper loading order
  }
})
