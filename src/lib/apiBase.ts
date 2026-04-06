import { Capacitor } from '@capacitor/core';

/**
 * Origem da API embutida no build (`VITE_API_ORIGIN` em `.env.local`).
 * No browser com Vite, pode ficar vazio: `fetch('/api/...')` usa o proxy para a porta da API.
 * No Capacitor (iOS/Android), vazio faz o pedido ir para `capacitor://localhost/api/...` — não existe servidor.
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
