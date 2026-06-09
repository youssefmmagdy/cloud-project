import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/health': 'https://d34xa50jp6x5my.cloudfront.net',
      '/api': 'https://d34xa50jp6x5my.cloudfront.net',
    },
  },
})
