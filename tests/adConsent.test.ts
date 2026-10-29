import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeAdConsent } from '../src/lib/adConsent.ts';

test('required UMP form must complete before SDK startup', async () => {
  const events: string[] = [];
  let complete!: () => void;
  const decision = new Promise<void>((resolve) => { complete = resolve; });
  const flow = initializeAdConsent({
    requestInfo: async () => ({ status: 'REQUIRED', isConsentFormAvailable: true, canRequestAds: false }),
    showForm: async () => {
      events.push('form');
      await decision;
      events.push('choice');
      return { status: 'OBTAINED', canRequestAds: true };
    },
    initialize: async () => { events.push('SDK'); },
  });
  await Promise.resolve();
  assert.deepEqual(events, ['form']);
  complete();
  await flow;
  assert.deepEqual(events, ['form', 'choice', 'SDK']);
});

test('unresolved UMP consent must not start SDK', async () => {
  const result = await initializeAdConsent({
    requestInfo: async () => ({ status: 'UNKNOWN', canRequestAds: false }),
    showForm: async () => { throw new Error('no form'); },
    initialize: async () => { assert.fail('SDK started without consent'); },
  });
  assert.equal(result.canRequestAds, false);
});

test('UMP failure must not start SDK', async () => {
  await assert.rejects(initializeAdConsent({
    requestInfo: async () => ({ status: 'REQUIRED', isConsentFormAvailable: true, canRequestAds: false }),
    showForm: async () => { throw new Error('form failed'); },
    initialize: async () => { assert.fail('SDK started after failure'); },
  }), /form failed/);
});

test('consent already resolved starts SDK without another form', async () => {
  let initialized = false;
  await initializeAdConsent({
    requestInfo: async () => ({ status: 'NOT_REQUIRED', canRequestAds: true }),
    showForm: async () => { throw new Error('unexpected form'); },
    initialize: async () => { initialized = true; },
  });
  assert.equal(initialized, true);
});
