import { Capacitor } from '@capacitor/core';

/** Substitui pelo teu domínio HTTPS; também em `.env.production` como `VITE_API_ORIGIN`. */
const PRODUCTION_API_FALLBACK =
  import.meta.env.VITE_API_ORIGIN_PRODUCTION_FALLBACK ?? 'https://SUA-API-AQUI.com';

function trimOrigin(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : '';
}

/**
 * Em `vite build`, o Vite pode injetar `VITE_API_ORIGIN` a partir de `.env.local` ou de `process.env`
 * no terminal — por vezes deixando localhost no IPA e a falhar no ATS do iOS.
 * Se o valor for inseguro em produção, usamos o fallback HTTPS.
 */
function isUnsafeOriginForProdBundle(origin: string): boolean {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    if (u.protocol === 'http:') return true;
    return false;
  } catch {
    return true;
  }
}

/**
 * Origem da API embutida no build.
 * - Dev: `.env.development.local` com `http://127.0.0.1:8787` (não entra no `vite build`).
 * - App Store: `.env.production` com URL **HTTPS** (ver `PRODUCTION_API_FALLBACK` se algo correr mal).
 * No browser com Vite, pode ficar vazio: `fetch('/api/...')` usa o proxy.
 * No Capacitor, vazio faz o pedido ir para `capacitor://localhost/api/...` — não existe servidor.
 */
export function getViteApiOrigin(): string {
  let o = trimOrigin(import.meta.env.VITE_API_ORIGIN);
  if (import.meta.env.PROD && isUnsafeOriginForProdBundle(o)) {
    o = trimOrigin(PRODUCTION_API_FALLBACK);
  }
  return o;
}

/** Monta URL absoluta para `/api` no nativo; relativa no web. */
export function buildApiUrl(path: string): string {
  const base = getViteApiOrigin();
  if (Capacitor.isNativePlatform() && !base) {
    throw new Error('MISSING_VITE_API_ORIGIN');
  }
  return `${base}${path}`;
}
