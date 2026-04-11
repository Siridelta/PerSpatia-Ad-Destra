import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
      '@v0': '/src/variants/v0-legacy',
      '@v1': '/src/variants/v1-math-scifi'
    }
  }
})
