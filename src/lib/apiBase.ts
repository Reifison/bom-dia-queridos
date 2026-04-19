import { Capacitor } from '@capacitor/core';

/**
 * Origem da API embutida no build.
 * - Dev: `.env.local` (ex.: `http://127.0.0.1:8787` para o simulador).
 * - App Store: `.env.production` com URL **HTTPS pública** da API (127.0.0.1 no telefone não alcança o seu Mac).
 * No browser com Vite, pode ficar vazio: `fetch('/api/...')` usa o proxy.
 * No Capacitor, vazio faz o pedido ir para `capacitor://localhost/api/...` — não existe servidor.
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
