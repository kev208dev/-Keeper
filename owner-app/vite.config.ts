import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8000', '/ingest': 'http://127.0.0.1:8000' },
  },
  build: {
    rolldownOptions: { input: ['index.html', 'simulator.html'] },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      include: ['src/domain/**'],
      exclude: ['src/domain/types.ts', 'src/**/*.test.ts'],
      thresholds: { branches: 100 },
    },
  },
})
