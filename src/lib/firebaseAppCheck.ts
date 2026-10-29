import { Capacitor } from '@capacitor/core';
import type { AppCheck } from 'firebase/app-check';
import type { FirebaseApp } from 'firebase/app';
import type { FirebaseClientPlatform } from './firebaseConfig';

export class FirebaseAppCheckInitializationError extends Error {
  readonly code = 'FIREBASE_AI_APPCHECK_FAILED';

  constructor(cause?: unknown) {
    super('FIREBASE_AI_APPCHECK_FAILED', { cause });
    this.name = 'FirebaseAppCheckInitializationError';
  }
}

export interface NativeAppCheckToken {
  token: string;
  expireTimeMillis?: number;
}

export interface NativeAppCheckPlugin {
  initialize(options?: { isTokenAutoRefreshEnabled?: boolean }): Promise<void>;
  getToken(options?: { forceRefresh?: boolean }): Promise<NativeAppCheckToken>;
}

export interface FirebaseAppCheckSdk {
  initializeAppCheck: typeof import('firebase/app-check').initializeAppCheck;
  CustomProvider: typeof import('firebase/app-check').CustomProvider;
  ReCaptchaEnterpriseProvider: typeof import('firebase/app-check').ReCaptchaEnterpriseProvider;
}

export interface FirebaseAppCheckDependencies {
  loadSdk: () => Promise<FirebaseAppCheckSdk>;
  loadNativePlugin: () => Promise<{ FirebaseAppCheck: NativeAppCheckPlugin }>;
}

export interface FirebaseAppCheckOptions {
  platform: FirebaseClientPlatform;
  siteKey?: string;
}

const TOKEN_FALLBACK_TTL_MS = 60 * 60 * 1_000;
const initializedApps = new WeakMap<FirebaseApp, Promise<AppCheck>>();

const defaultDependencies: FirebaseAppCheckDependencies = {
  loadSdk: async () => import('firebase/app-check'),
  loadNativePlugin: async () => import('@capacitor-firebase/app-check'),
};

export function getFirebaseClientPlatform(): FirebaseClientPlatform {
  const platform = Capacitor.getPlatform();
  if (Capacitor.isNativePlatform() && (platform === 'ios' || platform === 'android')) {
    return platform;
  }
  if (!Capacitor.isNativePlatform() && platform === 'web') return 'web';
  return 'unsupported';
}

export function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function createNativeAppCheckTokenProvider(
  getNativeToken: (options: { forceRefresh: false }) => Promise<NativeAppCheckToken>,
): { getToken: () => Promise<{ token: string; expireTimeMillis: number }> } {
  return {
    async getToken() {
      const result = await getNativeToken({ forceRefresh: false });
      if (!result || typeof result.token !== 'string' || !result.token.trim()) {
        throw new FirebaseAppCheckInitializationError(new Error('Native App Check token is empty'));
      }
      return {
        token: result.token,
        expireTimeMillis: Number.isFinite(result.expireTimeMillis) && (result.expireTimeMillis ?? 0) > 0
          ? result.expireTimeMillis!
          : Date.now() + TOKEN_FALLBACK_TTL_MS,
      };
    },
  };
}

/**
 * Initializes App Check only when an image request is made. Native Capacitor
 * builds use the platform attestation provider through the plugin; browser
 * builds use invisible, score-based reCAPTCHA Enterprise.
 */
export async function initializeFirebaseAppCheck(
  app: FirebaseApp,
  options: FirebaseAppCheckOptions,
  dependencies: FirebaseAppCheckDependencies = defaultDependencies,
): Promise<AppCheck> {
  const existing = initializedApps.get(app);
  if (existing) return existing;

  const operation = (async () => {
    if (options.platform === 'unsupported') {
      throw new FirebaseAppCheckInitializationError(new Error('Unsupported platform'));
    }

    if (options.platform === 'web') {
      const siteKey = options.siteKey?.trim();
      if (!siteKey) {
        throw new FirebaseAppCheckInitializationError(new Error('Web App Check site key is missing'));
      }
      const sdk = await dependencies.loadSdk();
      return sdk.initializeAppCheck(app, {
        provider: new sdk.ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }

    const sdk = await dependencies.loadSdk();
    const { FirebaseAppCheck } = await dependencies.loadNativePlugin();
    await FirebaseAppCheck.initialize({ isTokenAutoRefreshEnabled: true });
    const provider = new sdk.CustomProvider({
      getToken: createNativeAppCheckTokenProvider((tokenOptions) =>
        FirebaseAppCheck.getToken(tokenOptions),
      ).getToken,
    });
    return sdk.initializeAppCheck(app, {
      provider,
      // The native SDK owns refresh. A second JS refresher can repeatedly
      // receive the same cached native token once its refresh time has passed.
      // JS still obtains a valid token on demand for protected requests.
      isTokenAutoRefreshEnabled: false,
    });
  })();

  initializedApps.set(app, operation);
  try {
    return await operation;
  } catch (error) {
    if (initializedApps.get(app) === operation) initializedApps.delete(app);
    if (error instanceof FirebaseAppCheckInitializationError) throw error;
    throw new FirebaseAppCheckInitializationError(error);
  }
}
