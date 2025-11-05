/// <reference types="vite/client" />

interface ImportMetaEnv {

  /**
   * Proxy URL for the Foodsharing API proxy endpoint.
   * Set in environment files based on build mode:
   * - .env.local.local or .env.local: http://localhost:8787/proxy
   * - .env.emulator: http://localhost:5001/foodsharing-watcher/europe-west3/proxy
   * - .env.firebase: /proxy
   */
  readonly VITE_PROXY_URL?: string

}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
