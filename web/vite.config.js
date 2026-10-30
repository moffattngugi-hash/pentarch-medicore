import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), site: resolve(__dirname, 'site.html') }
    }
  },
  server: { proxy: { '/api': 'http://localhost:4000' } }
});
