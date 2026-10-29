import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

let instance = 0;
async function harness() {
  const events: string[] = [];
  const state = { status: 3, canRequestAds: true, required: false };
  const info = () => ({ status: state.required ? 'REQUIRED' : 'OBTAINED', isConsentFormAvailable: state.required, canRequestAds: state.canRequestAds });
  const mocks = {
    Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
    TrackingConsent: {
      requestConsentInfo: async () => { events.push('UMP info'); return info(); },
      request: async () => { events.push('ATT'); return { status: state.status }; },
      presentConsentForm: async () => { events.push('UMP form'); state.required = false; state.canRequestAds = true; return info(); },
      presentPrivacyOptionsForm: async () => { events.push('UMP options'); state.canRequestAds = true; return info(); },
    },
    AdMob: {
      requestConsentInfo: async () => { events.push('UMP info'); return info(); },
      initialize: async () => { events.push('SDK'); },
      showBanner: async (options: { npa: boolean }) => { assert.equal(options.npa, true); events.push('banner'); },
      removeBanner: async () => { events.push('remove'); },
      prepareInterstitial: async (options: { npa: boolean }) => { assert.equal(options.npa, true); events.push('prepare'); },
      prepareRewardVideoAd: async (options: { npa: boolean }) => { assert.equal(options.npa, true); events.push('reward'); },
    },
  };
  const key = `__adsConsentTest${++instance}`;
  (globalThis as any)[key] = mocks;
  const result = await build({
    stdin: { contents: await readFile(new URL('../src/services/mobileAds.ts', import.meta.url), 'utf8'), resolveDir: new URL('../src/services', import.meta.url).pathname, loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'node',
    define: { 'import.meta.env': '{"VITE_ADS_TESTING":"true"}' },
    plugins: [{ name: 'native-test-bridge', setup(builder) {
      builder.onResolve({ filter: /^@capacitor\/core$|^@capacitor-community\/admob$/ }, ({ path }) => ({ path, namespace: 'test-native' }));
      builder.onLoad({ filter: /.*/, namespace: 'test-native' }, ({ path }) => ({ contents: path === '@capacitor/core'
        ? `export const Capacitor = globalThis.${key}.Capacitor; export const registerPlugin = () => globalThis.${key}.TrackingConsent;`
        : `export const AdMob = globalThis.${key}.AdMob; export const BannerAdPosition = {}; export const BannerAdSize = {}; export const MaxAdContentRating = {}; export const InterstitialAdPluginEvents = {}; export const RewardAdPluginEvents = {};` }));
    } }],
  });
  const service = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${instance}`);
  return { service, state, events, mocks };
}

async function until(predicate: () => boolean) {
  for (let i = 0; i < 50 && !predicate(); i++) await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(predicate(), 'expected native operation was not reached');
}

test('ATT denial or restriction allows non-personalized ads after UMP consent', async () => {
  for (const status of [1, 2]) {
    const h = await harness();
    h.state.status = status;
    assert.equal((await h.service.initializeMobileAds()).canRequestAds, true);
    assert.equal(await h.service.showHomeBanner(), true);
    assert.equal(await h.service.preloadInterstitial(), true);
    assert.equal(await h.service.preloadRewarded(), true);
    assert.ok(h.events.indexOf('UMP info') > h.events.indexOf('ATT'));
    assert.ok(h.events.indexOf('SDK') > h.events.indexOf('UMP info'));
  }
});

test('real ads service presents required UMP before SDK and banner', async () => {
  const h = await harness();
  h.state.required = true;
  h.state.canRequestAds = false;
  assert.equal(await h.service.showHomeBanner(), true);
  assert.ok(h.events.indexOf('UMP form') > h.events.indexOf('ATT'));
  assert.ok(h.events.indexOf('SDK') > h.events.indexOf('UMP form'));
  assert.ok(h.events.indexOf('banner') > h.events.indexOf('SDK'));
});

test('pending ATT blocks cached readiness and invalidates previously prepared ads', async () => {
  const h = await harness();
  await h.service.showHomeBanner();
  await h.service.preloadInterstitial();
  const before = h.events.length;
  h.state.status = 0;
  assert.equal((await h.service.initializeMobileAds()).canRequestAds, false);
  assert.equal(await h.service.showInterstitial(), false);
  await h.service.removeHomeBanner();
  assert.equal(h.service.isInterstitialReady(), false);
  assert.ok(h.events.slice(before).every((event) => event === 'ATT' || event === 'remove'));
});

test('UMP options remain accessible before SDK initialization when consent blocks ads', async () => {
  const h = await harness();
  h.state.canRequestAds = false;
  await h.service.initializeMobileAds();
  assert.ok(!h.events.includes('SDK'));
  assert.equal(await h.service.showAdPrivacyOptions(), true);
  assert.ok(h.events.indexOf('UMP options') < h.events.indexOf('SDK'));
});

test('privacy changes wait for existing prepares and block new loads', async () => {
  const h = await harness();
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  h.mocks.AdMob.prepareInterstitial = async () => { h.events.push('prepare'); await pending; };
  const preparation = h.service.preloadInterstitial();
  await until(() => h.events.includes('prepare'));
  const options = h.service.showAdPrivacyOptions();
  await until(() => h.events.includes('remove'));
  assert.ok(!h.events.includes('UMP options'));
  assert.equal(await h.service.preloadRewarded(), false);
  assert.ok(!h.events.includes('reward'));
  finish();
  await preparation;
  assert.equal(await options, true);
  assert.ok(h.events.includes('UMP options'));
});
