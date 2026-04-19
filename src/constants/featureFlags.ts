/** Períodos do dia disponíveis (todos liberados). */
export const FEATURE_FLAGS = {
  ENABLE_MORNING: true,
  ENABLE_AFTERNOON: true,
  ENABLE_NIGHT: true,
} as const;

/** Banners e intersticial (AdMob nativo no iOS; mock no browser). `false` = tudo desligado. */
export const ADS_ENABLED = true;

/** Terceiro item da barra inferior (Ajustes). `true` quando a ecrã de ajustes existir. */
export const SHOW_SETTINGS_NAV = false;
