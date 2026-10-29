import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerContentAction, registerInterstitialShown, resetAdCadenceForLocalDate, shouldShowInterstitial } from '../src/lib/adCadence';

test('content actions share the two-action threshold and one-minute interval', (t) => {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'window', previous) : Reflect.deleteProperty(globalThis, 'window'));
  resetAdCadenceForLocalDate();
  registerContentAction();
  assert.equal(shouldShowInterstitial(1000), false);
  registerContentAction();
  assert.equal(shouldShowInterstitial(1000), true);
  registerInterstitialShown(1000);
  registerContentAction();
  assert.equal(shouldShowInterstitial(61000), false);
  registerContentAction();
  assert.equal(shouldShowInterstitial(60999), false);
  assert.equal(shouldShowInterstitial(61000), true);
});

test('midnight resets daily action counts but preserves the interval after the previous ad', (t) => {
  const start = new Date(2026, 9, 26, 23, 59, 30).getTime();
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'window', previous) : Reflect.deleteProperty(globalThis, 'window'));
  resetAdCadenceForLocalDate();
  registerInterstitialShown();
  t.mock.timers.tick(59_999);
  registerContentAction();
  registerContentAction();
  assert.equal(shouldShowInterstitial(), false);
  t.mock.timers.tick(1);
  assert.equal(shouldShowInterstitial(), true);
});
