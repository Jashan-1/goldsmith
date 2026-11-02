import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Same-origin /api keeps the session cookie simple in dev.
  server: { proxy: { '/api': 'http://localhost:8000' } },
})
