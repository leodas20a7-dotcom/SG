import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'SecureSys Platform',
        short_name: 'SecureSys',
        description: 'Premium enterprise security management platform',
        theme_color: '#1A1F2C',
        background_color: '#1A1F2C',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api/sambanova': {
        target: 'https://api.sambanova.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/sambanova/, '')
      }
    }
  }
})
