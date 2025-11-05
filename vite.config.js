import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  // Explicitly load environment variables based on mode
  // This ensures .env.[mode] files are properly loaded
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
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
