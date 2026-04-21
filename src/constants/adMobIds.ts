/**
 * IDs AdMob (intersticial e banner de produção). Sobrescreve com `VITE_ADMOB_*` em `.env` se precisares.
 * App ID iOS: `GADApplicationIdentifier` em `ios/App/App/Info.plist` (`ca-app-pub-1257467824403671~2501640483`).
 *
 * @see https://developers.google.com/admob/ios/test-ads
 */
export const ADMOB_INTERSTITIAL_UNIT_ID =
  import.meta.env.VITE_ADMOB_INTERSTITIAL_UNIT_ID ?? 'ca-app-pub-1257467824403671/8408573285';

export const ADMOB_BANNER_UNIT_ID =
  import.meta.env.VITE_ADMOB_BANNER_UNIT_ID ?? 'ca-app-pub-1257467824403671/1397577846';

/** Modo de teste do plugin em `import.meta.env.DEV`; com IDs de teste da Google também. */
export function adMobUseTestingMode(): boolean {
  return (
    import.meta.env.DEV ||
    ADMOB_INTERSTITIAL_UNIT_ID.includes('3940256099942544') ||
    ADMOB_BANNER_UNIT_ID.includes('3940256099942544')
  );
}
