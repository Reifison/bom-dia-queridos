import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_FIREBASE_AI_MODEL,
  getFirebaseAiAvailability,
  getFirebaseEnvironment,
  mergeFirebasePublicConfig,
  readFirebaseRuntimeSettings,
  type FirebaseEnvironment,
} from '../src/lib/firebaseConfig';

const completeEnvironment: FirebaseEnvironment = {
  VITE_FIREBASE_API_KEY: 'public-firebase-api-key',
  VITE_FIREBASE_PROJECT_ID: 'bom-dia-test',
  VITE_FIREBASE_APP_ID: '1:123:web:abc',
  VITE_FIREBASE_APPCHECK_SITE_KEY: 'public-recaptcha-site-key',
  VITE_FIREBASE_AI_ENABLED: 'true',
};

test('Firebase public configuration requires only the fields needed by AI Logic', () => {
  const settings = readFirebaseRuntimeSettings(completeEnvironment);
  assert.equal(settings.firebaseConfig?.apiKey, 'public-firebase-api-key');
  assert.equal(settings.firebaseConfig?.projectId, 'bom-dia-test');
  assert.equal(settings.firebaseConfig?.appId, '1:123:web:abc');
  assert.equal(settings.model, DEFAULT_FIREBASE_AI_MODEL);
  assert.equal(settings.enabled, true);
  assert.deepEqual(settings.missingFirebaseFields, []);

  const missing = readFirebaseRuntimeSettings({ VITE_FIREBASE_PROJECT_ID: 'bom-dia-test' });
  assert.equal(missing.firebaseConfig, undefined);
  assert.deepEqual(missing.missingFirebaseFields, [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_APP_ID',
  ]);
});

test('Firebase public JSON defaults map to Vite names and explicit Vite values override them', () => {
  assert.deepEqual(mergeFirebasePublicConfig({
    apiKey: 'firebase-public-key',
    projectId: 'public-project',
    appId: 'public-app',
    appCheckSiteKey: 'public-site-key',
    aiEnabled: false,
    aiModel: DEFAULT_FIREBASE_AI_MODEL,
  }, {}), {
    VITE_FIREBASE_API_KEY: 'firebase-public-key',
    VITE_FIREBASE_PROJECT_ID: 'public-project',
    VITE_FIREBASE_APP_ID: 'public-app',
    VITE_FIREBASE_AUTH_DOMAIN: undefined,
    VITE_FIREBASE_STORAGE_BUCKET: undefined,
    VITE_FIREBASE_MESSAGING_SENDER_ID: undefined,
    VITE_FIREBASE_APPCHECK_SITE_KEY: 'public-site-key',
    VITE_FIREBASE_AI_ENABLED: 'false',
    VITE_FIREBASE_AI_MODEL: DEFAULT_FIREBASE_AI_MODEL,
  });

  assert.equal(mergeFirebasePublicConfig({ apiKey: 'firebase-key' }, {
    VITE_FIREBASE_API_KEY: 'vite-override',
  }).VITE_FIREBASE_API_KEY, 'vite-override');
});

test('default runtime configuration reads the public project JSON without SDK initialization', () => {
  const environment = getFirebaseEnvironment();
  assert.equal(environment.VITE_FIREBASE_PROJECT_ID, 'bom-dia-queridos');
  assert.equal(environment.VITE_FIREBASE_APP_ID, '1:631290255780:web:748c5bd14b8410fe804931');
  assert.equal(readFirebaseRuntimeSettings().firebaseConfig?.projectId, 'bom-dia-queridos');
});

test('optional Firebase fields are included only when provided and model names are guarded', () => {
  const settings = readFirebaseRuntimeSettings({
    ...completeEnvironment,
    VITE_FIREBASE_AUTH_DOMAIN: 'bom-dia-test.firebaseapp.com',
    VITE_FIREBASE_STORAGE_BUCKET: 'bom-dia-test.firebasestorage.app',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
    VITE_FIREBASE_AI_MODEL: 'gemini-3.1-flash-image',
  });
  assert.equal(settings.firebaseConfig?.authDomain, 'bom-dia-test.firebaseapp.com');
  assert.equal(settings.firebaseConfig?.storageBucket, 'bom-dia-test.firebasestorage.app');
  assert.equal(settings.firebaseConfig?.messagingSenderId, '123');
  assert.equal(settings.modelValid, true);

  const invalidModel = readFirebaseRuntimeSettings({
    ...completeEnvironment,
    VITE_FIREBASE_AI_MODEL: '../private/key',
  });
  assert.equal(invalidModel.modelValid, false);
});

test('availability reports disabled, missing config, App Check setup, offline, and platform states locally', () => {
  assert.deepEqual(getFirebaseAiAvailability({
    env: { ...completeEnvironment, VITE_FIREBASE_AI_ENABLED: 'false' },
    platform: 'web',
    isOnline: true,
  }), { available: false, configured: true, supported: true, reason: 'disabled' });

  assert.equal(getFirebaseAiAvailability({
    env: { VITE_FIREBASE_AI_ENABLED: 'true' },
    platform: 'web',
    isOnline: true,
  }).reason, 'missing-firebase-config');

  const noSiteKey = { ...completeEnvironment };
  delete noSiteKey.VITE_FIREBASE_APPCHECK_SITE_KEY;
  assert.equal(getFirebaseAiAvailability({ env: noSiteKey, platform: 'web', isOnline: true }).reason,
    'missing-app-check-config');

  assert.equal(getFirebaseAiAvailability({ env: completeEnvironment, platform: 'web', isOnline: false }).reason,
    'offline');
  assert.equal(getFirebaseAiAvailability({ env: completeEnvironment, platform: 'unsupported', isOnline: true }).reason,
    'unsupported-platform');
  assert.equal(getFirebaseAiAvailability({ env: completeEnvironment, platform: 'ios', isOnline: true }).available,
    true);
});

test('Firebase AI Logic remains disabled unless explicitly enabled', () => {
  for (const value of [undefined, 'false', '0', 'yes', '']) {
    const settings = readFirebaseRuntimeSettings({ ...completeEnvironment, VITE_FIREBASE_AI_ENABLED: value });
    assert.equal(settings.enabled, false);
  }
});
