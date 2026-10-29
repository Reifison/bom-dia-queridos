import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createNativeAppCheckTokenProvider,
  initializeFirebaseAppCheck,
  type FirebaseAppCheckDependencies,
  type FirebaseAppCheckSdk,
  type NativeAppCheckPlugin,
} from '../src/lib/firebaseAppCheck';
import type { AppCheck } from 'firebase/app-check';
import type { FirebaseApp } from 'firebase/app';

test('native custom provider returns the attested token with its expiry', async () => {
  const calls: unknown[] = [];
  const provider = createNativeAppCheckTokenProvider(async (options) => {
    calls.push(options);
    return { token: 'native-app-check-token', expireTimeMillis: 1_900_000_000_000 };
  });

  assert.deepEqual(await provider.getToken(), {
    token: 'native-app-check-token',
    expireTimeMillis: 1_900_000_000_000,
  });
  assert.deepEqual(calls, [{ forceRefresh: false }]);
});

test('native custom provider rejects a missing token and supplies expiry if native SDK omits it', async () => {
  const provider = createNativeAppCheckTokenProvider(async () => ({ token: 'native-token' }));
  const before = Date.now();
  const result = await provider.getToken();
  assert.ok(result.expireTimeMillis >= before + 3_500_000);

  const missingToken = createNativeAppCheckTokenProvider(async () => ({ token: '  ' }));
  await assert.rejects(missingToken.getToken(), /FIREBASE_AI_APPCHECK_FAILED/);
});

test('web App Check requires a site key before loading SDK modules', async () => {
  let sdkLoads = 0;
  const dependencies: FirebaseAppCheckDependencies = {
    loadSdk: async () => {
      sdkLoads += 1;
      throw new Error('Unexpected SDK load');
    },
    loadNativePlugin: async () => { throw new Error('Unexpected plugin load'); },
  };

  await assert.rejects(
    initializeFirebaseAppCheck({} as FirebaseApp, { platform: 'web' }, dependencies),
    /FIREBASE_AI_APPCHECK_FAILED/,
  );
  assert.equal(sdkLoads, 0);
});

test('web initializes invisible reCAPTCHA Enterprise provider and does not load native plugin', async () => {
  const events: string[] = [];
  class FakeRecaptchaEnterpriseProvider { constructor(public siteKey: string) {} }
  const result = {} as AppCheck;
  const sdk = {
    ReCaptchaEnterpriseProvider: FakeRecaptchaEnterpriseProvider,
    CustomProvider: class {},
    initializeAppCheck: (_app: FirebaseApp, options: { provider: unknown }) => {
      assert.ok(options.provider instanceof FakeRecaptchaEnterpriseProvider);
      assert.equal((options.provider as FakeRecaptchaEnterpriseProvider).siteKey, 'test-site-key');
      events.push('web-init');
      return result;
    },
  } as unknown as FirebaseAppCheckSdk;
  const dependencies: FirebaseAppCheckDependencies = {
    loadSdk: async () => sdk,
    loadNativePlugin: async () => { throw new Error('Native plugin should not load on Web'); },
  };

  const appCheck = await initializeFirebaseAppCheck(
    {} as FirebaseApp,
    { platform: 'web', siteKey: 'test-site-key' },
    dependencies,
  );
  assert.equal(appCheck, result);
  assert.deepEqual(events, ['web-init']);
});

test('native initialization gets an attestation token through CustomProvider', async () => {
  const events: string[] = [];
  let customProviderOptions: { getToken: () => Promise<unknown> } | undefined;
  class FakeCustomProvider {
    constructor(options: { getToken: () => Promise<unknown> }) {
      customProviderOptions = options;
    }
  }
  const result = {} as AppCheck;
  const sdk = {
    ReCaptchaEnterpriseProvider: class {},
    CustomProvider: FakeCustomProvider,
    initializeAppCheck: (_app: FirebaseApp, options: { provider: unknown; isTokenAutoRefreshEnabled: boolean }) => {
      assert.ok(options.provider instanceof FakeCustomProvider);
      assert.equal(options.isTokenAutoRefreshEnabled, false, 'native SDK owns token refresh');
      events.push('js-init');
      return result;
    },
  } as unknown as FirebaseAppCheckSdk;
  const plugin: NativeAppCheckPlugin = {
    initialize: async () => { events.push('native-init'); },
    getToken: async (options) => {
      assert.deepEqual(options, { forceRefresh: false });
      events.push('native-token');
      return { token: 'attested-token', expireTimeMillis: 1_900_000_000_000 };
    },
  };
  const dependencies: FirebaseAppCheckDependencies = {
    loadSdk: async () => sdk,
    loadNativePlugin: async () => ({ FirebaseAppCheck: plugin }),
  };

  const appCheck = await initializeFirebaseAppCheck(
    {} as FirebaseApp,
    { platform: 'ios' },
    dependencies,
  );
  assert.equal(appCheck, result);
  assert.deepEqual(events, ['native-init', 'js-init']);
  assert.deepEqual(await customProviderOptions!.getToken(), {
    token: 'attested-token',
    expireTimeMillis: 1_900_000_000_000,
  });
  assert.deepEqual(events, ['native-init', 'js-init', 'native-token']);
});
