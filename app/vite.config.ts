import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Dev proxy: /example decks come straight from the repo (no upload needed in dev).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/example': {
        target: 'http://localhost:5174',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/example/, ''),
      },
    },
  },
})
