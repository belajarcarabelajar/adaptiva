import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./setupTests.ts'],
    globals: true,
  },
  define: {
    'process.env.API_KEY': JSON.stringify('test_key'),
    'process.env.GEMINI_API_KEY': JSON.stringify('test_key'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
})
