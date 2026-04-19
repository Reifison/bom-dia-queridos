/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ORIGIN?: string;
  readonly VITE_ADMOB_INTERSTITIAL_UNIT_ID?: string;
  readonly VITE_ADMOB_BANNER_UNIT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
