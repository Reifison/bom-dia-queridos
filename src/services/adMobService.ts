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

/** Garante que nenhum banner nativo fique visível (ex.: após desativar banners ou hot reload). */
export async function removeNativeBanner(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AdMob.removeBanner();
  } catch {
    // ignore
  }
}

const interstitialOptions = () => ({
  adId: ADMOB_INTERSTITIAL_UNIT_ID,
  isTesting: adMobUseTestingMode(),
});

/**
 * Pré-carrega um intersticial em cache. Não exibe nada — seguro para chamar no arranque.
 * Cumpre a regra da App Store de não mostrar ads sem ação do utilizador (Guideline 4 - Design).
 */
export async function prepareInterstitialAd(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ensureAdMobInitialized();
    await AdMob.prepareInterstitial(interstitialOptions());
  } catch (e) {
    devLog.info('prepareInterstitial failed', e);
  }
}

/**
 * Exibe um intersticial **apenas em resposta a um gesto explícito do utilizador**.
 * Faz prepare + show e invoca `onFinished` no máximo uma vez (dismissed, falha de load,
 * falha de show ou erro). Não chamar em `useEffect` de arranque nem em navegação automática.
 */
export async function showInterstitialAd(onFinished?: () => void): Promise<void> {
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
    await AdMob.prepareInterstitial(interstitialOptions());
    await AdMob.showInterstitial();
  } catch (e) {
    devLog.info('Interstitial prepare/show threw', e);
    finishOnce();
  }
}
