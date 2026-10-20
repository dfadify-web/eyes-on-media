import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: { port: 5178, proxy: { '/api': 'http://127.0.0.1:7778', '/file': 'http://127.0.0.1:7778', '/status': 'http://127.0.0.1:7778' } },
});
