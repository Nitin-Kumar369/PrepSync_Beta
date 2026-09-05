import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
        	
          // Do NOT rewrite the path; keep `/api` so backend routes like
          // `/api/books/*` are reached as-is.
      }
    }
  }
})
