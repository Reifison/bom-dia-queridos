import { AdMob, InterstitialAdPluginEvents } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';
import { ADMOB_INTERSTITIAL_UNIT_ID, adMobUseTestingMode } from '../constants/adMobIds';
import { devLog } from '../lib/logger';

let initPromise: Promise<void> | null = null;

export function ensureAdMobInitialized(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return Promise.resolve();
  }
  if (!initPromise) {
    initPromise = AdMob.initialize().catch((e) => {
      devLog.info('AdMob.initialize failed', e);
      initPromise = null;
      throw e;
    });
  }
  return initPromise;
}

/**
 * Loads and shows a full-screen interstitial; invokes `onFinished` at most once
 * (dismissed, failed to load, failed to show, or error). Omit when nothing must run after.
 */
export async function presentInterstitialAd(onFinished?: () => void): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    onFinished?.();
    return;
  }

  try {
    await ensureAdMobInitialized();
  } catch {
    onFinished?.();
    return;
  }

  const options = {
    adId: ADMOB_INTERSTITIAL_UNIT_ID,
    isTesting: adMobUseTestingMode(),
  };

  let finished = false;
  const handles: { remove: () => Promise<void> }[] = [];

  const finishOnce = () => {
    if (finished) return;
    finished = true;
    void Promise.all(handles.map((h) => h.remove())).catch(() => {});
    onFinished?.();
  };

  handles.push(
    await AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, (err) => {
      devLog.info('Interstitial failed to load', err);
      finishOnce();
    }),
  );
  handles.push(
    await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, (err) => {
      devLog.info('Interstitial failed to show', err);
      finishOnce();
    }),
  );
  handles.push(
    await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
      finishOnce();
    }),
  );

  try {
    await AdMob.prepareInterstitial(options);
    await AdMob.showInterstitial();
  } catch (e) {
    devLog.info('Interstitial prepare/show threw', e);
    finishOnce();
  }
}
