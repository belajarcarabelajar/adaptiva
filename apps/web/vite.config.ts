/// <reference types="vitest" />
import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api/gemini': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  envDir: path.resolve(__dirname, '../..'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./setupTests.ts'],
    globals: true,
  },
});
