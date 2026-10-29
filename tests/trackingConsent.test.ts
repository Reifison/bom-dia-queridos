import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureTrackingConsent, type TrackingStatus } from '../src/lib/trackingConsent.ts';

for (const status of [1, 2, 3] as TrackingStatus[]) {
  test(`ATT status ${status} completes before advertising can start`, async () => {
    const events: string[] = [];
    let complete!: (value: { status: TrackingStatus }) => void;
    const response = new Promise<{ status: TrackingStatus }>((resolve) => { complete = resolve; });
    const flow = (async () => {
      const allowed = await ensureTrackingConsent('ios', () => { events.push('ATT'); return response; });
      if (allowed) events.push('ads');
    })();
    assert.deepEqual(events, ['ATT']);
    complete({ status });
    await flow;
    assert.deepEqual(events, ['ATT', 'ads']);
  });
}

test('an unanswered ATT request prevents SDK startup', async () => {
  await assert.rejects(ensureTrackingConsent('ios', async () => ({ status: 0 })), /ATT_DEFERRED/);
});

test('a native ATT failure prevents SDK startup and allows a subsequent retry', async () => {
  await assert.rejects(ensureTrackingConsent('ios', async () => { throw new Error('unavailable'); }), /unavailable/);
  await ensureTrackingConsent('ios', async () => ({ status: 2 }));
});

test('Android and web do not invoke the iOS permission bridge', async () => {
  for (const platform of ['android', 'web']) {
    await ensureTrackingConsent(platform, async () => { throw new Error('iOS-only'); });
  }
});
