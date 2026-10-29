import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFirebaseImageService,
  extractFirebaseImageDataUrl,
  FirebaseImageGenerationError,
  mapFirebaseAiError,
  withFirebaseAiTimeout,
} from '../src/services/firebaseImageService';
import type { FirebaseEnvironment } from '../src/lib/firebaseConfig';
import type { FirebaseApp } from 'firebase/app';

const env: FirebaseEnvironment = {
  VITE_FIREBASE_API_KEY: 'public-firebase-api-key',
  VITE_FIREBASE_PROJECT_ID: 'bom-dia-test',
  VITE_FIREBASE_APP_ID: '1:123:web:abc',
  VITE_FIREBASE_APPCHECK_SITE_KEY: 'public-recaptcha-key',
  VITE_FIREBASE_AI_ENABLED: 'true',
};

function fakeAppModules() {
  const app = {
    name: '[DEFAULT]',
    options: {
      apiKey: 'public-firebase-api-key',
      projectId: 'bom-dia-test',
      appId: '1:123:web:abc',
    },
  } as unknown as FirebaseApp;
  return {
    app,
    module: {
      getApps: () => [],
      initializeApp: () => app,
    } as unknown as typeof import('firebase/app'),
  };
}

test('image service loads Firebase lazily and returns a valid image-only data URL', async () => {
  const { app, module: firebaseApp } = fakeAppModules();
  let appModuleLoads = 0;
  let aiModuleLoads = 0;
  let appCheckCalls = 0;
  let requestCount = 0;
  const service = createFirebaseImageService({
    getEnvironment: () => env,
    getPlatform: () => 'web',
    isOnline: () => true,
    loadFirebaseApp: async () => { appModuleLoads += 1; return firebaseApp; },
    initializeAppCheck: async (_app, options) => {
      appCheckCalls += 1;
      assert.equal(_app, app);
      assert.equal(options.platform, 'web');
      assert.equal(options.siteKey, 'public-recaptcha-key');
    },
    loadFirebaseAI: async () => {
      aiModuleLoads += 1;
      return {
        getAI: (target, options) => {
          assert.equal(target, app);
          assert.ok(options.backend);
          return {};
        },
        GoogleAIBackend: class {},
        ResponseModality: { IMAGE: 'IMAGE' },
        getGenerativeModel: (_ai, params) => {
          assert.equal(params.model, 'gemini-3.1-flash-image');
          assert.deepEqual(params.generationConfig.responseModalities, ['IMAGE']);
          return {
            generateContent: async (prompt: string) => {
              requestCount += 1;
              assert.match(prompt, /bom dia/i);
              return {
                response: {
                  inlineDataParts: () => [{ inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } }],
                },
              };
            },
          };
        },
      } as unknown as typeof import('firebase/ai');
    },
  });

  assert.deepEqual(service.getAvailability(), { available: true, configured: true, supported: true, reason: 'ready' });
  assert.equal(appModuleLoads, 0);
  assert.equal(aiModuleLoads, 0);
  assert.equal(await service.generate('morning'), 'data:image/png;base64,aGVsbG8=');
  assert.equal(appModuleLoads, 1);
  assert.equal(aiModuleLoads, 1);
  assert.equal(appCheckCalls, 1);
  assert.equal(requestCount, 1);
});

test('Firebase image errors provide user-facing text in the selected language', () => {
  const portuguese = new FirebaseImageGenerationError('FIREBASE_AI_DISABLED', undefined, 'pt');
  const english = new FirebaseImageGenerationError('FIREBASE_AI_DISABLED', undefined, 'en');
  assert.match(portuguese.userMessage, /desativada/i);
  assert.match(english.userMessage, /turned off/i);
});

test('disabled, unconfigured, and offline states never load Firebase SDKs', async () => {
  let loads = 0;
  const dependencies = {
    getPlatform: () => 'web' as const,
    isOnline: () => true,
    loadFirebaseApp: async () => { loads += 1; throw new Error('Should not load'); },
    loadFirebaseAI: async () => { loads += 1; throw new Error('Should not load'); },
  };
  const disabled = createFirebaseImageService({ ...dependencies, getEnvironment: () => ({ ...env, VITE_FIREBASE_AI_ENABLED: 'false' }) });
  await assert.rejects(disabled.generate('morning'), (error: FirebaseImageGenerationError) => {
    assert.equal(error.code, 'FIREBASE_AI_DISABLED');
    assert.match(error.userMessage, /desativada/i);
    return true;
  });

  const incomplete = createFirebaseImageService({ ...dependencies, getEnvironment: () => ({ VITE_FIREBASE_AI_ENABLED: 'true' }) });
  await assert.rejects(incomplete.generate('morning'), (error: FirebaseImageGenerationError) => {
    assert.equal(error.code, 'FIREBASE_AI_NOT_CONFIGURED');
    return true;
  });

  const offline = createFirebaseImageService({ ...dependencies, getEnvironment: () => env, isOnline: () => false });
  await assert.rejects(offline.generate('night'), (error: FirebaseImageGenerationError) => {
    assert.equal(error.code, 'FIREBASE_AI_OFFLINE');
    return true;
  });
  assert.equal(loads, 0);
});

test('invalid periods and malformed image payloads fail without returning false success', async () => {
  const { module: firebaseApp } = fakeAppModules();
  let loads = 0;
  const service = createFirebaseImageService({
    getEnvironment: () => env,
    getPlatform: () => 'web',
    isOnline: () => true,
    loadFirebaseApp: async () => { loads += 1; return firebaseApp; },
  });
  await assert.rejects(service.generate('day' as never), (error: FirebaseImageGenerationError) => {
    assert.equal(error.code, 'FIREBASE_AI_INVALID_PERIOD');
    return true;
  });
  assert.equal(loads, 0);

  for (const payload of [
    {},
    { inlineDataParts: () => [{ inlineData: { mimeType: 'text/plain', data: 'aGVsbG8=' } }] },
    { inlineDataParts: () => [{ inlineData: { mimeType: 'image/png', data: 'bad!' } }] },
    { inlineDataParts: () => undefined },
  ]) {
    assert.throws(() => extractFirebaseImageDataUrl(payload), (error: FirebaseImageGenerationError) => {
      assert.equal(error.code, 'FIREBASE_AI_INVALID_RESPONSE');
      return true;
    });
  }
});

test('image extraction handles the SDK helper shape and skips thought image parts', () => {
  assert.equal(extractFirebaseImageDataUrl({
    inlineDataParts: () => [
      { thought: true, inlineData: { mimeType: 'image/png', data: 'dGhvdWdodA==' } },
      { inlineData: { mimeType: 'image/jpeg', data: '/9j/4AAQSkZJRg==' } },
    ],
  }), 'data:image/jpeg;base64,/9j/4AAQSkZJRg==');

  assert.throws(() => extractFirebaseImageDataUrl({
    inlineDataParts: () => [
      { thought: true, inlineData: { mimeType: 'image/png', data: 'dGhvdWdodA==' } },
    ],
  }), (error: FirebaseImageGenerationError) => {
    assert.equal(error.code, 'FIREBASE_AI_INVALID_RESPONSE');
    return true;
  });
});

test('blocked model responses return a safety error', () => {
  assert.throws(() => extractFirebaseImageDataUrl({
    promptFeedback: { blockReason: 'SAFETY' },
    candidates: [],
  }), (error: FirebaseImageGenerationError) => {
    assert.equal(error.code, 'FIREBASE_AI_BLOCKED');
    return true;
  });
});

test('request timeout aborts the in-flight request and has a stable code', async () => {
  const controller = new AbortController();
  let aborted = false;
  controller.signal.addEventListener('abort', () => { aborted = true; });
  await assert.rejects(
    withFirebaseAiTimeout(new Promise(() => {}), 5, controller),
    (error: FirebaseImageGenerationError) => {
      assert.equal(error.code, 'FIREBASE_AI_TIMEOUT');
      assert.match(error.userMessage, /demorou/i);
      return true;
    },
  );
  assert.equal(aborted, true);
});

test('initialization timeout covers App Check and late completion never starts a billable model request', async () => {
  const { module: firebaseApp } = fakeAppModules();
  let resolveAppCheck!: () => void;
  let aiModuleLoads = 0;
  let modelRequests = 0;
  const service = createFirebaseImageService({
    getEnvironment: () => env,
    getPlatform: () => 'web',
    isOnline: () => true,
    timeoutMs: 5,
    loadFirebaseApp: async () => firebaseApp,
    initializeAppCheck: () => new Promise<void>((resolve) => { resolveAppCheck = resolve; }),
    loadFirebaseAI: async () => {
      aiModuleLoads += 1;
      return {
        getAI: () => ({}),
        GoogleAIBackend: class {},
        ResponseModality: { IMAGE: 'IMAGE' },
        getGenerativeModel: () => ({
          generateContent: async () => {
            modelRequests += 1;
            return { response: { inlineDataParts: () => [{ inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } }] } };
          },
        }),
      } as unknown as typeof import('firebase/ai');
    },
  });

  await assert.rejects(service.generate('morning'), (error: FirebaseImageGenerationError) => {
    assert.equal(error.code, 'FIREBASE_AI_TIMEOUT');
    return true;
  });
  resolveAppCheck();
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(aiModuleLoads, 0);
  assert.equal(modelRequests, 0);
});

test('billing, quota, App Check, and model errors remain distinct', () => {
  assert.equal(mapFirebaseAiError({ status: 429, message: 'Resource exhausted' }).code,
    'FIREBASE_AI_QUOTA_EXCEEDED');
  assert.equal(mapFirebaseAiError({ status: 429, message: 'Blaze billing is required' }).code,
    'FIREBASE_AI_BILLING_REQUIRED');
  assert.equal(mapFirebaseAiError({ status: 429, message: 'Check your plan and billing details' }).code,
    'FIREBASE_AI_QUOTA_EXCEEDED');
  assert.equal(mapFirebaseAiError({ status: 403, message: 'App Check token was rejected' }).code,
    'FIREBASE_AI_APPCHECK_FAILED');
  assert.equal(mapFirebaseAiError({ status: 404, message: 'model was not found' }).code,
    'FIREBASE_AI_MODEL_UNAVAILABLE');
});
