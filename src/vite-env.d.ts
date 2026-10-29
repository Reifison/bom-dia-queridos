/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ORIGIN?: string;
  readonly VITE_ADS_TESTING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
