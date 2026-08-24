import { Capacitor } from '@capacitor/core';

/**
 * Origem da API embutida no build (`VITE_API_ORIGIN` em `.env.local`).
 * No browser com Vite, pode ficar vazio: `fetch('/api/...')` usa o proxy para a porta da API.
 * No Capacitor (iOS/Android), vazio faz o pedido ir para a origem local do WebView — não existe servidor.
 * No Android Emulator, a API no computador fica em `http://10.0.2.2:8787`;
 * num aparelho físico, use o IP da máquina na rede local.
 */
export function getViteApiOrigin(): string {
  const o = import.meta.env.VITE_API_ORIGIN;
  return typeof o === 'string' ? o.trim().replace(/\/$/, '') : '';
}

/** Monta URL absoluta para `/api` no nativo; relativa no web. */
export function buildApiUrl(path: string): string {
  const base = getViteApiOrigin();
  if (Capacitor.isNativePlatform() && !base) {
    throw new Error('MISSING_VITE_API_ORIGIN');
  }
  return `${base}${path}`;
}
