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
    // Só o index.html como entrada — evita que o scanner siga JS antigo em ios/App/.../public (cap sync).
    optimizeDeps: {
      entries: [path.resolve(__dirname, 'index.html')],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: ['**/ios/**', '**/android/**'],
      },
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${API_PORT}`,
          changeOrigin: true,
        },
      },
    },
  };
});
