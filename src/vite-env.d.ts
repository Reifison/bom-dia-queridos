/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ORIGIN?: string;
  /** Opcional: HTTPS usado se `VITE_API_ORIGIN` for localhost/http no bundle de produção. */
  readonly VITE_API_ORIGIN_PRODUCTION_FALLBACK?: string;
  readonly VITE_ADMOB_INTERSTITIAL_UNIT_ID?: string;
  readonly VITE_ADMOB_BANNER_UNIT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
