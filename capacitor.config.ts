import type { CapacitorConfig } from '@capacitor/cli';

/**
 * iOS/Android: `npm run ios:sync` ou `npm run android:sync` compila o front-end
 * e inclui os assets locais no bundle nativo. O app básico funciona offline.
 * A geração opcional de imagens Firebase precisa de conexão e usa App Check.
 *
 * `server.url` abaixo é apenas para live reload do front-end Vite durante o
 * desenvolvimento. Não é necessário apontar para uma API para o app atual.
 * Para URLs HTTP de live reload, habilite `cleartext: true` apenas no ambiente
 * de desenvolvimento e use um endereço acessível pelo alvo:
 * - iOS Simulator: http://localhost:3000.
 * - Android Emulator: http://10.0.2.2:3000 (localhost do host).
 * - Dispositivo físico: use o IP da máquina na mesma rede.
 *
 * A configuração Firebase pública está em src/config/firebase.public.json;
 * os arquivos nativos GoogleService-Info.plist e google-services.json são
 * usados pelo App Check nativo.
 */
const config: CapacitorConfig = {
  appId: 'com.bomdiaqueridos.app',
  appName: 'Bom dia queridos',
  webDir: 'dist',
  experimental: {
    ios: { spm: { packageOptions: { '@capacitor-firebase/app-check': { symlink: true } } } },
  },
  server: {
    // Live reload opcional do front-end (não é configuração de API):
    // url: 'http://localhost:3000',
    // cleartext: true,
  },
  ios: {
    contentInset: 'never',
  },
};

export default config;
