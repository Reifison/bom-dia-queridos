export type MobileAdsPlatform = 'ios' | 'android' | 'web';
export type NativeMobileAdsPlatform = Exclude<MobileAdsPlatform, 'web'>;

export interface MobileAdsIds {
  appId: string;
  banner: string;
  interstitial: string;
  rewarded: string;
}

/** Production AdMob application and ad-unit IDs. These are public identifiers. */
export const MOBILE_ADS_PRODUCTION_IDS: Record<NativeMobileAdsPlatform, MobileAdsIds> = {
  ios: {
    appId: 'ca-app-pub-1257467824403671~2501640483',
    banner: 'ca-app-pub-1257467824403671/1397577846',
    interstitial: 'ca-app-pub-1257467824403671/8408573285',
    rewarded: 'ca-app-pub-1257467824403671/6461900283',
  },
  android: {
    appId: 'ca-app-pub-1257467824403671~9999916542',
    banner: 'ca-app-pub-1257467824403671/6089531040',
    interstitial: 'ca-app-pub-1257467824403671/2150286036',
    rewarded: 'ca-app-pub-1257467824403671/4552982896',
  },
};

/** Official Google demo ad units used for every native test build. */
export const MOBILE_ADS_TEST_IDS: Record<NativeMobileAdsPlatform, MobileAdsIds> = {
  ios: {
    appId: 'ca-app-pub-3940256099942544~1458002511',
    banner: 'ca-app-pub-3940256099942544/2934735716',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
  },
  android: {
    appId: 'ca-app-pub-3940256099942544~3347511713',
    banner: 'ca-app-pub-3940256099942544/6300978111',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
  },
};

/**
 * Native builds are test builds unless production is explicitly opted into.
 * Only the literal value `false` (case-insensitive, with surrounding whitespace
 * ignored) releases production IDs.
 */
export function resolveAdsTestingFlag(value: unknown): boolean {
  return String(value ?? '').trim().toLowerCase() !== 'false';
}

export function getMobileAdsIds(
  platform: NativeMobileAdsPlatform,
  testing = true,
): MobileAdsIds {
  return (testing ? MOBILE_ADS_TEST_IDS : MOBILE_ADS_PRODUCTION_IDS)[platform];
}
