import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMobileAdsIds,
  MOBILE_ADS_PRODUCTION_IDS,
  MOBILE_ADS_TEST_IDS,
  resolveAdsTestingFlag,
} from '../src/lib/mobileAdsConfig.ts';

test('ads testing is enabled unless production is explicitly requested', () => {
  assert.equal(resolveAdsTestingFlag(undefined), true);
  assert.equal(resolveAdsTestingFlag(''), true);
  assert.equal(resolveAdsTestingFlag('true'), true);
  assert.equal(resolveAdsTestingFlag('1'), true);
  assert.equal(resolveAdsTestingFlag('false'), false);
  assert.equal(resolveAdsTestingFlag(' FALSE '), false);
  assert.equal(resolveAdsTestingFlag(false), false);
  assert.equal(resolveAdsTestingFlag(0), true);
});

test('test mode returns the official iOS and Android demo IDs', () => {
  assert.deepEqual(getMobileAdsIds('ios', true), MOBILE_ADS_TEST_IDS.ios);
  assert.deepEqual(getMobileAdsIds('android', true), MOBILE_ADS_TEST_IDS.android);
  assert.match(MOBILE_ADS_TEST_IDS.ios.appId, /^ca-app-pub-3940256099942544~/);
  assert.match(MOBILE_ADS_TEST_IDS.android.appId, /^ca-app-pub-3940256099942544~/);
});

test('production IDs are returned only when testing is explicitly disabled', () => {
  assert.deepEqual(getMobileAdsIds('ios', false), MOBILE_ADS_PRODUCTION_IDS.ios);
  assert.deepEqual(getMobileAdsIds('android', false), MOBILE_ADS_PRODUCTION_IDS.android);
  assert.notDeepEqual(getMobileAdsIds('ios', true), MOBILE_ADS_PRODUCTION_IDS.ios);
  assert.notDeepEqual(getMobileAdsIds('android', true), MOBILE_ADS_PRODUCTION_IDS.android);
});
