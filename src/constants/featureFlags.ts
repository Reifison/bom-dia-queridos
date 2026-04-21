/** Períodos do dia disponíveis (todos liberados). */
export const FEATURE_FLAGS = {
  ENABLE_MORNING: true,
  ENABLE_AFTERNOON: true,
  ENABLE_NIGHT: true,
} as const;

/** Intersticial e (se ativo) banners AdMob nativos no iOS; mock de intersticial no browser. `false` = tudo desligado. */
export const ADS_ENABLED = true;

/** Banner horizontal (home e detalhe). `false` = sem banner; intersticial não é afetado. */
export const BANNER_ADS_ENABLED = false;

/** Terceiro item da barra inferior (Ajustes). `true` quando a ecrã de ajustes existir. */
export const SHOW_SETTINGS_NAV = false;
