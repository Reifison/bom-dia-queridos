import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { ensureTrackingConsent, type TrackingStatus } from '../lib/trackingConsent';
import { initializeAdConsent } from '../lib/adConsent';
import {
  AdMob,
  type AdmobConsentInfo,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
  MaxAdContentRating,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import {
  getMobileAdsIds,
  MOBILE_ADS_PRODUCTION_IDS,
  MOBILE_ADS_TEST_IDS,
  resolveAdsTestingFlag,
  type MobileAdsPlatform,
  type NativeMobileAdsPlatform,
} from '../lib/mobileAdsConfig';
import {
  type AdLifecycleEvent,
  type AdLifecycleSubscribe,
  waitForAdLifecycle,
} from '../lib/adLifecycle';

/**
 * AdMob service for Capacitor 8.
 *
 * Native app IDs are also configured in Info.plist and AndroidManifest.xml.
 * Web is intentionally a safe no-op: AdMob native ads are not requested there.
 */

export const MOBILE_ADS_PACKAGE = '@capacitor-community/admob';

export const MOBILE_ADS_INSTALL_COMMANDS = [
  'npm install @capacitor-community/admob',
  'npx cap sync',
] as const;

// Kept as a compatibility export for callers that import the production IDs.
export const MOBILE_ADS_IDS = MOBILE_ADS_PRODUCTION_IDS;
export { MOBILE_ADS_PRODUCTION_IDS, MOBILE_ADS_TEST_IDS, getMobileAdsIds, resolveAdsTestingFlag };
export type { MobileAdsPlatform, NativeMobileAdsPlatform } from '../lib/mobileAdsConfig';

const ADS_TESTING = resolveAdsTestingFlag(import.meta.env?.VITE_ADS_TESTING);
const TrackingConsent = registerPlugin<{
  request(): Promise<{ status: TrackingStatus }>;
  requestConsentInfo(): Promise<AdmobConsentInfo>;
  presentConsentForm(): Promise<AdmobConsentInfo>;
  presentPrivacyOptionsForm(): Promise<AdmobConsentInfo>;
}>('TrackingConsent');
const INITIALIZATION_RETRY_COOLDOWN_MS = 1_500;
const INTERSTITIAL_RETRY_COOLDOWN_MS = 1_500;
const INTERSTITIAL_INITIAL_EVENT_TIMEOUT_MS = 8_000;
const INTERSTITIAL_DISMISSAL_WATCHDOG_MS = 5 * 60 * 1_000;
const REWARDED_INITIAL_EVENT_TIMEOUT_MS = 8_000;
const REWARDED_DISMISSAL_WATCHDOG_MS = 5 * 60 * 1_000;

export function isMobileAdsTestingEnabled(): boolean {
  return ADS_TESTING;
}

export interface MobileAdsInitResult {
  platform: MobileAdsPlatform;
  available: boolean;
  canRequestAds: boolean;
  privacyOptionsRequirementStatus?: string;
}

export interface RewardedAdResult {
  granted: boolean;
  available: boolean;
  amount?: number;
  currency?: string;
  reason?: 'web' | 'missing-ad-unit' | 'plugin-unavailable' | 'ad-failed';
}

let initialization: Promise<MobileAdsInitResult> | undefined;
let consentChanging = false;
let trackingCheck: Promise<boolean> | undefined;

function trackingDecisionCompleted(platform: MobileAdsPlatform): Promise<boolean> {
  if (platform !== 'ios') return Promise.resolve(true);
  if (trackingCheck) return trackingCheck;
  const pending = ensureTrackingConsent(platform, () => TrackingConsent.request());
  trackingCheck = pending;
  const clear = () => { if (trackingCheck === pending) trackingCheck = undefined; };
  void pending.then(clear, clear);
  return pending;
}

function blockAdsUntilTrackingDecision(): void {
  initialization = undefined;
  invalidatePreparedAds();
  if (bannerMounted) void removeBannerForConsentChange();
}
let initializationRetryNotBefore = 0;
let privacyOptionsFlow: Promise<boolean> | undefined;

let interstitialPrepared = false;
let interstitialPreparation: Promise<boolean> | undefined;
let interstitialRetryNotBefore = 0;
let interstitialShowing = false;
let interstitialLoadGeneration = 0;

let rewardedPrepared = false;
let rewardedPreparation: Promise<boolean> | undefined;
let rewardedLoadGeneration = 0;

type BannerIntent = 'visible' | 'hidden' | 'removed';
let bannerIntent: BannerIntent = 'hidden';
let bannerMounted = false;
let bannerHidden = false;
let bannerQueue: Promise<void> = Promise.resolve();

function getPlatform(): MobileAdsPlatform {
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android' ? platform : 'web';
}

function nativeAdsAvailable(): boolean {
  const platform = getPlatform();
  return platform !== 'web' && Capacitor.isNativePlatform();
}

/** Exported so UI callers can avoid offering native-only rewarded actions on Web. */
export function isNativeAdsPlatform(): boolean {
  return nativeAdsAvailable();
}

function nativePlatform(platform: MobileAdsPlatform): NativeMobileAdsPlatform | undefined {
  return platform === 'ios' || platform === 'android' ? platform : undefined;
}

function unavailableResult(platform: MobileAdsPlatform): MobileAdsInitResult {
  return { platform, available: false, canRequestAds: false };
}

function safeFailureCode(error: unknown): string {
  if (typeof error === 'string' && error.trim()) {
    return error.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 64);
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: unknown; errorCode?: unknown };
    const rawCode = candidate.code ?? candidate.errorCode;
    if (typeof rawCode === 'number' && Number.isFinite(rawCode)) return String(rawCode);
    if (typeof rawCode === 'string' && rawCode.trim()) {
      return rawCode.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 64);
    }
  }

  if (error instanceof Error && error.name) {
    return error.name.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 64);
  }
  return 'unknown';
}

function logAdsFailure(operation: string, error: unknown): void {
  globalThis.console?.warn('[ads]', { operation, code: safeFailureCode(error) });
}

async function initializeNativeAds(platform: NativeMobileAdsPlatform): Promise<MobileAdsInitResult> {
  const consent = await initializeAdConsent({
    requestInfo: () => platform === 'ios' ? TrackingConsent.requestConsentInfo() : AdMob.requestConsentInfo(),
    showForm: () => platform === 'ios'
      ? TrackingConsent.presentConsentForm()
      : AdMob.showConsentForm(),
    initialize: async () => {
      // The user may have visited Settings while the regional form was open.
      if (!(await trackingDecisionCompleted(platform))) throw new Error('ATT_DEFERRED');
      return AdMob.initialize({
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
        maxAdContentRating: MaxAdContentRating.General,
      });
    },
  });

  return {
    platform,
    available: true,
    canRequestAds: consent.canRequestAds,
    privacyOptionsRequirementStatus: consent.privacyOptionsRequirementStatus,
  };
}

function invalidatePreparedAds(): void {
  interstitialLoadGeneration += 1;
  interstitialPrepared = false;
  interstitialPreparation = undefined;
  interstitialRetryNotBefore = 0;

  rewardedLoadGeneration += 1;
  rewardedPrepared = false;
  rewardedPreparation = undefined;
}

async function refreshConsentAndInitialization(
  platform: NativeMobileAdsPlatform,
): Promise<MobileAdsInitResult> {
  if (!(await trackingDecisionCompleted(platform))) {
    blockAdsUntilTrackingDecision();
    return { platform, available: true, canRequestAds: false };
  }
  const consent = platform === 'ios' ? await TrackingConsent.requestConsentInfo() : await AdMob.requestConsentInfo();
  const consentResult: MobileAdsInitResult = {
    platform,
    available: true,
    canRequestAds: consent.canRequestAds,
    privacyOptionsRequirementStatus: consent.privacyOptionsRequirementStatus,
  };

  if (!consent.canRequestAds) {
    initialization = Promise.resolve(consentResult);
    initializationRetryNotBefore = 0;
    return consentResult;
  }

  // The SDK may already be initialized, but calling initialize again is
  // intentionally idempotent and makes the post-form state explicit.
  if (!(await trackingDecisionCompleted(platform))) {
    blockAdsUntilTrackingDecision();
    return { ...consentResult, canRequestAds: false };
  }
  await AdMob.initialize({
    tagForChildDirectedTreatment: false,
    tagForUnderAgeOfConsent: false,
    maxAdContentRating: MaxAdContentRating.General,
  });

  const readyResult: MobileAdsInitResult = {
    ...consentResult,
    canRequestAds: true,
  };
  initialization = Promise.resolve(readyResult);
  initializationRetryNotBefore = 0;
  return readyResult;
}

/**
 * Requests UMP consent before initialization/loading and retries transient
 * native failures after a short cooldown instead of caching failure forever.
 */
export async function initializeMobileAds(): Promise<MobileAdsInitResult> {
  const platform = getPlatform();
  if (!nativeAdsAvailable() || consentChanging) return unavailableResult(platform);
  try {
    if (!(await trackingDecisionCompleted(platform))) {
      blockAdsUntilTrackingDecision();
      return { platform, available: true, canRequestAds: false };
    }
  } catch (error) {
    blockAdsUntilTrackingDecision();
    logAdsFailure('tracking-consent', error);
    return unavailableResult(platform);
  }
  if (consentChanging) return unavailableResult(platform);
  if (initialization) return initialization;

  const now = Date.now();
  if (now < initializationRetryNotBefore) return Promise.resolve(unavailableResult(platform));

  const nativePlatformName = nativePlatform(platform);
  if (!nativePlatformName) return Promise.resolve(unavailableResult(platform));

  const pending = initializeNativeAds(nativePlatformName)
    .catch((error: unknown) => {
      logAdsFailure('initialize', error);
      initializationRetryNotBefore = Date.now() + INITIALIZATION_RETRY_COOLDOWN_MS;
      return unavailableResult(platform);
    });

  initialization = pending;
  void pending.then((result) => {
    if (!result.available) {
      initializationRetryNotBefore = Date.now() + INITIALIZATION_RETRY_COOLDOWN_MS;
      if (initialization === pending) initialization = undefined;
    }
  });
  return pending;
}

function enqueueBanner<T>(operation: () => Promise<T>): Promise<T> {
  const next = bannerQueue.then(operation, operation);
  bannerQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function removeBannerForConsentChange(): Promise<void> {
  return enqueueBanner(async () => {
    if (!nativeAdsAvailable()) return;
    try {
      await AdMob.removeBanner();
    } catch (error) {
      logAdsFailure('remove-banner-consent-change', error);
    } finally {
      bannerMounted = false;
      bannerHidden = false;
    }
  });
}

/** Shows the native adaptive banner intended for the Home screen. */
export function showHomeBanner(): Promise<boolean> {
  bannerIntent = 'visible';

  return enqueueBanner(async () => {
    const initialized = await initializeMobileAds();
    if (
      !initialized.available ||
      !initialized.canRequestAds ||
      consentChanging ||
      initialized.platform === 'web' ||
      bannerIntent !== 'visible'
    ) {
      return false;
    }

    const ids = getMobileAdsIds(initialized.platform, ADS_TESTING);
    try {
      if (bannerMounted && !bannerHidden) return true;
      if (bannerMounted && bannerHidden) {
        await AdMob.resumeBanner();
      } else {
        await AdMob.showBanner({
          adId: ids.banner,
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          // Leaves room for the app's fixed bottom navigation.
          margin: 82,
          isTesting: ADS_TESTING,
          npa: true,
        });
      }
      bannerMounted = true;
      bannerHidden = false;
      return true;
    } catch (error) {
      bannerMounted = false;
      bannerHidden = false;
      logAdsFailure('show-banner', error);
      return false;
    }
  });
}

export function hideHomeBanner(): Promise<void> {
  bannerIntent = 'hidden';

  return enqueueBanner(async () => {
    if (!nativeAdsAvailable() || !bannerMounted) return;
    try {
      await AdMob.hideBanner();
      bannerHidden = true;
    } catch (error) {
      logAdsFailure('hide-banner', error);
    }
  });
}

export function removeHomeBanner(): Promise<void> {
  bannerIntent = 'removed';

  return enqueueBanner(async () => {
    if (!nativeAdsAvailable()) return;
    try {
      await AdMob.removeBanner();
    } catch (error) {
      logAdsFailure('remove-banner', error);
    } finally {
      bannerMounted = false;
      bannerHidden = false;
    }
  });
}

/** Preloads an interstitial with a single in-flight request. */
export function preloadInterstitial(): Promise<boolean> {
  if (interstitialShowing) return Promise.resolve(false);
  if (interstitialPrepared) return Promise.resolve(true);
  if (interstitialPreparation) return interstitialPreparation;
  if (Date.now() < interstitialRetryNotBefore) return Promise.resolve(false);

  const loadGeneration = interstitialLoadGeneration;
  const preparation = (async () => {
    const initialized = await initializeMobileAds();
    if (!initialized.available || !initialized.canRequestAds || consentChanging || initialized.platform === 'web') {
      return false;
    }

    const ids = getMobileAdsIds(initialized.platform, ADS_TESTING);
    try {
      await AdMob.prepareInterstitial({
        adId: ids.interstitial,
        isTesting: ADS_TESTING,
        npa: true,
      });
      if (loadGeneration !== interstitialLoadGeneration) return false;
      interstitialPrepared = true;
      interstitialRetryNotBefore = 0;
      return true;
    } catch (error) {
      if (loadGeneration === interstitialLoadGeneration) {
        interstitialPrepared = false;
        interstitialRetryNotBefore = Date.now() + INTERSTITIAL_RETRY_COOLDOWN_MS;
      }
      logAdsFailure('preload-interstitial', error);
      return false;
    }
  })();

  interstitialPreparation = preparation;
  void preparation.then(
    () => {
      if (interstitialPreparation === preparation) interstitialPreparation = undefined;
    },
    (error) => {
      interstitialRetryNotBefore = Date.now() + INTERSTITIAL_RETRY_COOLDOWN_MS;
      logAdsFailure('preload-interstitial', error);
      if (interstitialPreparation === preparation) interstitialPreparation = undefined;
    },
  );
  return preparation;
}

function cleanupPluginListener(handle: PluginListenerHandle): () => Promise<void> {
  return () => handle.remove();
}

function subscribeInterstitialEvent(
  event: AdLifecycleEvent,
  listener: (payload?: unknown) => void,
): Promise<() => Promise<void>> {
  switch (event) {
    case 'showed':
      return AdMob.addListener(InterstitialAdPluginEvents.Showed, () => listener()).then(
        cleanupPluginListener,
      );
    case 'dismissed':
      return AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => listener()).then(
        cleanupPluginListener,
      );
    case 'failedToShow':
      return AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, (error) => listener(error)).then(
        cleanupPluginListener,
      );
    case 'rewarded':
      return Promise.reject(new Error('interstitial-does-not-reward'));
  }
}

function subscribeRewardedEvent(
  event: AdLifecycleEvent,
  listener: (payload?: unknown) => void,
): Promise<() => Promise<void>> {
  switch (event) {
    case 'showed':
      return AdMob.addListener(RewardAdPluginEvents.Showed, () => listener()).then(
        cleanupPluginListener,
      );
    case 'dismissed':
      return AdMob.addListener(RewardAdPluginEvents.Dismissed, () => listener()).then(
        cleanupPluginListener,
      );
    case 'failedToShow':
      return AdMob.addListener(RewardAdPluginEvents.FailedToShow, (error) => listener(error)).then(
        cleanupPluginListener,
      );
    case 'rewarded':
      return AdMob.addListener(RewardAdPluginEvents.Rewarded, (reward) => listener(reward)).then(
        cleanupPluginListener,
      );
  }
}

/**
 * The installed 8.1.0 plugin resolves showInterstitial() before dismissal.
 * Wait for its lifecycle events. The short timeout only covers failure to
 * start; the five-minute watchdog handles a lost dismissal event without
 * treating a legitimately long ad as completed.
 */
async function showInterstitialWithEvents(): Promise<boolean> {
  const lifecycle = await waitForAdLifecycle({
    subscribe: subscribeInterstitialEvent as AdLifecycleSubscribe,
    invoke: async () => {
      const consent = await initializeMobileAds();
      if (!consent.canRequestAds || consentChanging) throw new Error('AD_CONSENT_CHANGED');
      return AdMob.showInterstitial();
    },
    initialTimeoutMs: INTERSTITIAL_INITIAL_EVENT_TIMEOUT_MS,
    dismissalTimeoutMs: INTERSTITIAL_DISMISSAL_WATCHDOG_MS,
  });
  if (!lifecycle.success) logAdsFailure(`show-interstitial-${lifecycle.outcome}`, lifecycle.outcome);
  if (lifecycle.shown && !lifecycle.success) throw new Error('AD_DISMISSAL_UNCONFIRMED');
  return lifecycle.success;
}

async function showRewardedWithEvents(): Promise<{
  success: boolean;
  reward?: unknown;
  outcome: string;
}> {
  const lifecycle = await waitForAdLifecycle({
    subscribe: subscribeRewardedEvent as AdLifecycleSubscribe,
    invoke: async () => {
      const consent = await initializeMobileAds();
      if (!consent.canRequestAds || consentChanging) throw new Error('AD_CONSENT_CHANGED');
      return AdMob.showRewardVideoAd();
    },
    requireReward: true,
    initialTimeoutMs: REWARDED_INITIAL_EVENT_TIMEOUT_MS,
    dismissalTimeoutMs: REWARDED_DISMISSAL_WATCHDOG_MS,
  });
  if (!lifecycle.success) logAdsFailure(`show-rewarded-${lifecycle.outcome}`, lifecycle.outcome);
  return lifecycle;
}

/** Shows the prepared interstitial and prepares the next one after success. */
export function isInterstitialReady(): boolean {
  return interstitialPrepared && !interstitialShowing;
}

export async function showInterstitial(): Promise<boolean> {
  const consent = await initializeMobileAds();
  if (!consent.canRequestAds || consentChanging) return false;
  if (interstitialShowing) return false;
  if (!interstitialPrepared) {
    void preloadInterstitial();
    return false;
  }

  interstitialPrepared = false;
  interstitialShowing = true;
  try {
    const shown = await showInterstitialWithEvents();
    if (!shown) {
      interstitialRetryNotBefore = Date.now() + INTERSTITIAL_RETRY_COOLDOWN_MS;
    }
    return shown;
  } finally {
    interstitialShowing = false;
    void preloadInterstitial();
  }
}

/** Preloads one rewarded ad for the active native platform. */
export function preloadRewarded(): Promise<boolean> {
  if (rewardedPrepared) return Promise.resolve(true);
  if (rewardedPreparation) return rewardedPreparation;

  const loadGeneration = rewardedLoadGeneration;
  const preparation = (async () => {
    const initialized = await initializeMobileAds();
    if (!initialized.available || !initialized.canRequestAds || consentChanging || initialized.platform === 'web') {
      return false;
    }

    const rewardedId = getMobileAdsIds(initialized.platform, ADS_TESTING).rewarded;
    try {
      await AdMob.prepareRewardVideoAd({
        adId: rewardedId,
        isTesting: ADS_TESTING,
        npa: true,
      });
      if (loadGeneration !== rewardedLoadGeneration) return false;
      rewardedPrepared = true;
      return true;
    } catch (error) {
      if (loadGeneration === rewardedLoadGeneration) rewardedPrepared = false;
      logAdsFailure('preload-rewarded', error);
      return false;
    }
  })();

  rewardedPreparation = preparation;
  void preparation.then(
    () => {
      if (rewardedPreparation === preparation) rewardedPreparation = undefined;
    },
    (error) => {
      logAdsFailure('preload-rewarded', error);
      if (rewardedPreparation === preparation) rewardedPreparation = undefined;
    },
  );
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

  const rewardedId = getMobileAdsIds(platform, ADS_TESTING).rewarded;
  if (!rewardedId) return { granted: false, available: false, reason: 'missing-ad-unit' };

  try {
    if (!rewardedPrepared && !(await preloadRewarded())) {
      return { granted: false, available: true, reason: 'ad-failed' };
    }
    // In plugin 8.1.0 the native Promise resolves at the earned-reward
    // callback, while dismissal is a separate event. The lifecycle helper
    // waits for both and only accepts the Rewarded event as proof of credit.
    const lifecycle = await showRewardedWithEvents();
    rewardedPrepared = false;
    if (!lifecycle.success) {
      return { granted: false, available: true, reason: 'ad-failed' };
    }
    void preloadRewarded();
    const reward =
      lifecycle.reward && typeof lifecycle.reward === 'object'
        ? (lifecycle.reward as { amount?: number; type?: string })
        : undefined;
    return {
      granted: true,
      available: true,
      amount: reward?.amount,
      currency: reward?.type,
    };
  } catch (error) {
    rewardedPrepared = false;
    logAdsFailure('show-rewarded', error);
    return { granted: false, available: true, reason: 'ad-failed' };
  }
}

/** Suspend ad requests and discard prepared ads before changing consent. */
export function showAdPrivacyOptions(): Promise<boolean> {
  if (!nativeAdsAvailable()) return Promise.resolve(false);
  if (privacyOptionsFlow) return privacyOptionsFlow;

  const flow = (async () => {
    const initialized = await initializeMobileAds();
    if (!initialized.available) return false;
    consentChanging = true;
    initialization = undefined;
    const pendingLoads = [interstitialPreparation, rewardedPreparation].filter(Boolean);
    invalidatePreparedAds();
    let shown = false;
    try {
      await removeBannerForConsentChange();
      // A native prepare cannot be cancelled. Let existing requests settle
      // before the user makes a new choice; their generations are invalid.
      await Promise.allSettled(pendingLoads);
      if (initialized.platform === 'ios') await TrackingConsent.presentPrivacyOptionsForm();
      else await AdMob.showPrivacyOptionsForm();
      shown = true;
      const platform = nativePlatform(getPlatform());
      if (platform) await refreshConsentAndInitialization(platform);
      return true;
    } catch (error) {
      initialization = undefined;
      initializationRetryNotBefore = Date.now() + INITIALIZATION_RETRY_COOLDOWN_MS;
      logAdsFailure('privacy-consent-change', error);
      return shown;
    } finally {
      consentChanging = false;
    }
  })();

  privacyOptionsFlow = flow;
  const clear = () => { if (privacyOptionsFlow === flow) privacyOptionsFlow = undefined; };
  void flow.then((shown) => {
    clear();
    if (shown) resumeAdsWithCurrentConsent();
  }, clear);
  return flow;
}

function resumeAdsWithCurrentConsent(): void {
  void initializeMobileAds().then((result) => {
    if (!result.canRequestAds) return;
    if (bannerIntent === 'visible') void showHomeBanner();
    void preloadInterstitial();
    void preloadRewarded();
  });
}

// Native scene activation covers a change made in iOS Settings. Each load
// and show also passes through initializeMobileAds and rechecks ATT.
if (typeof window !== 'undefined' && nativeAdsAvailable()) {
  window.addEventListener('adprivacyresume', resumeAdsWithCurrentConsent);
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
  // Each show handles its own preload/retry and waits for dismissal.
  const first = await showRewarded();
  if (!first.granted) return { granted: false, completed: 0, results: [first] };
  const second = await showRewarded();
  return {
    granted: first.granted && second.granted,
    completed: Number(first.granted) + Number(second.granted),
    results: [first, second],
  };
}
