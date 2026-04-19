/**
 * Google sample ad units (safe for development).
 * Replace with your real units from AdMob before App Store release; also set `GADApplicationIdentifier`
 * in `ios/App/App/Info.plist` to your iOS App ID (`ca-app-pub-…~…`).
 *
 * @see https://developers.google.com/admob/ios/test-ads
 */
export const ADMOB_INTERSTITIAL_UNIT_ID =
  import.meta.env.VITE_ADMOB_INTERSTITIAL_UNIT_ID ?? 'ca-app-pub-3940256099942544/4411468910';

export const ADMOB_BANNER_UNIT_ID =
  import.meta.env.VITE_ADMOB_BANNER_UNIT_ID ?? 'ca-app-pub-3940256099942544/2934735716';

/** Sample publisher IDs from Google should keep test mode on until you use your own units. */
export function adMobUseTestingMode(): boolean {
  return import.meta.env.DEV || ADMOB_INTERSTITIAL_UNIT_ID.includes('3940256099942544');
}
