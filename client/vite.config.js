import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy /api to the local backend. In production the app is served as
// static files by Caddy, which reverse-proxies /api to the api container.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist' },
});
