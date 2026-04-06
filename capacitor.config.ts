import type { CapacitorConfig } from '@capacitor/cli';

/**
 * iOS (Xcode): após `npm run build && npx cap sync ios`, abra com `npx cap open ios`.
 *
 * Dev com API no Mac (Simulador):
 * - Descomente `server.url` com http://localhost:3000 e rode `npm run dev` antes do Run no Xcode.
 * - Em iPhone físico, use o IP da sua rede (ex: http://192.168.1.10:3000) e `cleartext: true`.
 *
 * Build estático sem server.url:
 * - Defina VITE_API_ORIGIN no .env.production com a URL HTTPS da sua API em produção.
 */
const config: CapacitorConfig = {
  appId: 'com.bomdiaqueridos.app',
  appName: 'Bom dia queridos',
  webDir: 'dist',
  server: {
    // Live reload / API via Vite proxy no Simulador (descomente para testar):
    // url: 'http://localhost:3000',
    // cleartext: true,
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
