import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPosition,
  BannerAdSize,
  MaxAdContentRating,
} from '@capacitor-community/admob';

/**
 * AdMob service for Capacitor 8.
 *
 * Package: @capacitor-community/admob (v8)
 * Install with:
 *   npm install @capacitor-community/admob
 *   npx cap sync
 *
 * Native app IDs must also be configured in Info.plist and AndroidManifest.xml.
 * Web is intentionally a safe no-op: AdMob native ads are not requested there.
 */

export const MOBILE_ADS_PACKAGE = '@capacitor-community/admob';

export const MOBILE_ADS_INSTALL_COMMANDS = [
  'npm install @capacitor-community/admob',
  'npx cap sync',
] as const;

export const MOBILE_ADS_IDS = {
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
} as const;

export type MobileAdsPlatform = 'ios' | 'android' | 'web';

export interface MobileAdsInitResult {
  platform: MobileAdsPlatform;
  available: boolean;
  canRequestAds: boolean;
}

export interface RewardedAdResult {
  granted: boolean;
  available: boolean;
  amount?: number;
  currency?: string;
  reason?: 'web' | 'missing-ad-unit' | 'plugin-unavailable' | 'ad-failed';
}

let initialization: Promise<MobileAdsInitResult> | undefined;
let interstitialPrepared = false;
let rewardedPrepared = false;
let rewardedPreparation: Promise<boolean> | undefined;

function getPlatform(): MobileAdsPlatform {
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android' ? platform : 'web';
}

function idsFor(platform: Exclude<MobileAdsPlatform, 'web'>) {
  return MOBILE_ADS_IDS[platform];
}

function nativeAdsAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

/** Initializes AdMob once and requests consent before ads are loaded. */
export function initializeMobileAds(): Promise<MobileAdsInitResult> {
  if (initialization) return initialization;

  initialization = (async () => {
    const platform = getPlatform();
    if (!nativeAdsAvailable()) {
      return { platform, available: false, canRequestAds: false };
    }

    try {
      await AdMob.initialize({
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
        maxAdContentRating: MaxAdContentRating.General,
      });
      let consent = await AdMob.requestConsentInfo();
      if (
        !consent.canRequestAds &&
        consent.isConsentFormAvailable &&
        consent.status === AdmobConsentStatus.REQUIRED
      ) {
        consent = await AdMob.showConsentForm();
      }

      return { platform, available: true, canRequestAds: consent.canRequestAds };
    } catch {
      // A missing native plugin, denied consent, or SDK failure must not block the app.
      return { platform, available: false, canRequestAds: false };
    }
  })();

  return initialization;
}

/** Shows the native adaptive banner intended for the Home screen. */
export async function showHomeBanner(): Promise<boolean> {
  const initialized = await initializeMobileAds();
  if (!initialized.available || !initialized.canRequestAds || initialized.platform === 'web') {
    return false;
  }

  try {
    await AdMob.showBanner({
      adId: idsFor(initialized.platform).banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      // Leaves room for the app's fixed bottom navigation.
      margin: 82,
      isTesting: import.meta.env.DEV,
      npa: true,
    });
    return true;
  } catch {
    return false;
  }
}

export async function hideHomeBanner(): Promise<void> {
  if (!nativeAdsAvailable()) return;
  try {
    await AdMob.hideBanner();
  } catch {
    // Safe no-op when the native plugin is unavailable.
  }
}

export async function removeHomeBanner(): Promise<void> {
  if (!nativeAdsAvailable()) return;
  try {
    await AdMob.removeBanner();
  } catch {
    // Safe no-op when the native plugin is unavailable.
  }
}

/** Preloads an interstitial so it can be shown at a natural transition. */
export async function preloadInterstitial(): Promise<boolean> {
  const initialized = await initializeMobileAds();
  if (!initialized.available || !initialized.canRequestAds || initialized.platform === 'web') {
    return false;
  }

  try {
    await AdMob.prepareInterstitial({
      adId: idsFor(initialized.platform).interstitial,
      isTesting: import.meta.env.DEV,
      npa: true,
    });
    interstitialPrepared = true;
    return true;
  } catch {
    interstitialPrepared = false;
    return false;
  }
}

/** Shows the prepared interstitial and immediately starts preparing the next one. */
export async function showInterstitial(): Promise<boolean> {
  if (!interstitialPrepared) return false;

  try {
    await AdMob.showInterstitial();
    interstitialPrepared = false;
    void preloadInterstitial();
    return true;
  } catch {
    interstitialPrepared = false;
    return false;
  }
}

/**
 * Preloads one rewarded ad for the active native platform.
 */
export function preloadRewarded(): Promise<boolean> {
  if (rewardedPrepared) return Promise.resolve(true);
  if (rewardedPreparation) return rewardedPreparation;

  const preparation = (async () => {
    const initialized = await initializeMobileAds();
    if (!initialized.available || !initialized.canRequestAds || initialized.platform === 'web') {
      return false;
    }

    const rewardedId = idsFor(initialized.platform).rewarded;
    if (!rewardedId) return false;

    try {
      await AdMob.prepareRewardVideoAd({
        adId: rewardedId,
        isTesting: import.meta.env.DEV,
        npa: true,
      });
      rewardedPrepared = true;
      return true;
    } catch {
      rewardedPrepared = false;
      return false;
    }
  })();

  rewardedPreparation = preparation;
  void preparation.finally(() => {
    if (rewardedPreparation === preparation) rewardedPreparation = undefined;
  });
  return preparation;
}

/** Shows one rewarded ad and reports whether the user earned the reward. */
export async function showRewarded(): Promise<RewardedAdResult> {
  const platform = getPlatform();
  if (platform === 'web') return { granted: false, available: false, reason: 'web' };

  const initialized = await initializeMobileAds();
  if (!initialized.available || !initialized.canRequestAds) {
    return { granted: false, available: false, reason: 'plugin-unavailable' };
  }

  const rewardedId = idsFor(platform).rewarded;
  if (!rewardedId) return { granted: false, available: false, reason: 'missing-ad-unit' };

  try {
    if (!rewardedPrepared && !(await preloadRewarded())) {
      return { granted: false, available: true, reason: 'ad-failed' };
    }
    const reward = await AdMob.showRewardVideoAd();
    rewardedPrepared = false;
    void preloadRewarded();
    return {
      granted: true,
      available: true,
      amount: reward.amount,
      currency: reward.type,
    };
  } catch {
    rewardedPrepared = false;
    return { granted: false, available: true, reason: 'ad-failed' };
  }
}

/**
 * Runs two rewarded ads sequentially. The caller should grant two image
 * generations only when both results have `granted: true`.
 */
export async function showTwoRewardedAds(): Promise<{
  granted: boolean;
  completed: number;
  results: [RewardedAdResult, RewardedAdResult?];
}> {
  if (!(await preloadRewarded())) {
    const unavailable = await showRewarded();
    return { granted: false, completed: 0, results: [unavailable] };
  }
  const first = await showRewarded();
  if (!first.granted) return { granted: false, completed: 0, results: [first] };

  if (!(await preloadRewarded())) {
    return { granted: false, completed: 1, results: [first] };
  }
  const second = await showRewarded();
  return {
    granted: first.granted && second.granted,
    completed: Number(first.granted) + Number(second.granted),
    results: [first, second],
  };
}
