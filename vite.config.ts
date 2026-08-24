import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const API_PORT = env.API_PORT || '8787';

  return {
    // Relative paths so Capacitor/WKWebView loads JS/CSS from the app bundle.
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: ['**/android/**', '**/ios/**'],
      },
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${API_PORT}`,
          changeOrigin: true,
        },
      },
    },
    // Capacitor copies a production index.html into the native folders. Limit
    // dependency discovery to this source entry so Vite never scans that copy.
    optimizeDeps: {
      entries: ['index.html'],
    },
  };
});
