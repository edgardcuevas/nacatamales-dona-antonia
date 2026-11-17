import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { siteUrlPlugin } from './vite.siteUrlPlugin.js'

// https://vite.dev/config/
// VITE_SITE_URL sale de .env.production o del entorno del despliegue.
// REQUIRE_SITE_URL no lleva prefijo VITE_ a proposito: es una bandera del
// comando de build, no un dato que deba acabar en el bundle.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    plugins: [react(), siteUrlPlugin(env.VITE_SITE_URL, { requireSiteUrl: process.env.REQUIRE_SITE_URL === '1' })],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  }
})
