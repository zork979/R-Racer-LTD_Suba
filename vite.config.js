import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:8000', '/uploads': 'http://127.0.0.1:8000' } },
  build: { outDir: 'dist', sourcemap: false, rollupOptions: {output:{manualChunks(id){if(id.includes('node_modules/react-router'))return 'router';if(id.includes('node_modules/react-dom')||id.includes('node_modules/react/'))return 'react';}}} }
});
