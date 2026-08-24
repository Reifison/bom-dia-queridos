import type { CapacitorConfig } from '@capacitor/cli';

/**
 * iOS/Android: após `npm run build && npx cap sync <plataforma>`, abra o
 * projeto nativo no Xcode ou Android Studio.
 *
 * Dev com API no computador (live reload):
 * - iOS Simulator: http://localhost:3000.
 * - Android Emulator: http://10.0.2.2:3000 (localhost do host).
 * - Dispositivo físico: use o IP da sua rede (ex: http://192.168.1.10:3000).
 * - Para URLs HTTP de desenvolvimento, habilite `cleartext: true`.
 *
 * Build estático sem server.url:
 * - Defina VITE_API_ORIGIN no .env.production com a URL HTTPS da sua API em produção.
 */
const config: CapacitorConfig = {
  appId: 'com.bomdiaqueridos.app',
  appName: 'Bom dia queridos',
  webDir: 'dist',
  server: {
    // Live reload via Vite (descomente para testar; escolha a URL conforme o alvo):
    // url: 'http://localhost:3000',
    // cleartext: true,
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
