import test from 'node:test';
import assert from 'node:assert/strict';
import {
  waitForAdLifecycle,
  type AdLifecycleEvent,
  type AdLifecycleListener,
} from '../src/lib/adLifecycle.ts';

class FakeEmitter {
  private readonly listeners = new Map<AdLifecycleEvent, Set<AdLifecycleListener>>();

  subscribe = (event: AdLifecycleEvent, listener: AdLifecycleListener): (() => void) => {
    const listeners = this.listeners.get(event) ?? new Set<AdLifecycleListener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener);
  };

  emit(event: AdLifecycleEvent, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }

  listenerCount(): number {
    let total = 0;
    for (const listeners of this.listeners.values()) total += listeners.size;
    return total;
  }
}

const options = (emitter: FakeEmitter, invoke: () => unknown | Promise<unknown>) => ({
  subscribe: emitter.subscribe,
  invoke,
  requireReward: true,
  initialTimeoutMs: 40,
  dismissalTimeoutMs: 80,
});

test('rewarded lifecycle succeeds only after reward and dismissal', async () => {
  const emitter = new FakeEmitter();
  const lifecyclePromise = waitForAdLifecycle(
    options(emitter, async () => {
      emitter.emit('showed');
      emitter.emit('rewarded', { amount: 1, type: 'generation' });
      await new Promise((resolve) => setTimeout(resolve, 5));
      emitter.emit('dismissed');
    }),
  );

  const result = await lifecyclePromise;
  assert.deepEqual(result, {
    success: true,
    shown: true,
    rewarded: true,
    outcome: 'completed',
    reward: { amount: 1, type: 'generation' },
  });
  assert.equal(emitter.listenerCount(), 0);
});

test('non-rewarded lifecycle completes on show and dismissal', async () => {
  const emitter = new FakeEmitter();
  const result = await waitForAdLifecycle({
    subscribe: emitter.subscribe,
    invoke: () => {
      emitter.emit('showed');
      emitter.emit('dismissed');
    },
    requireReward: false,
    initialTimeoutMs: 20,
    dismissalTimeoutMs: 20,
  });

  assert.equal(result.success, true);
  assert.equal(result.outcome, 'completed');
  assert.equal(result.shown, true);
  assert.equal(result.rewarded, false);
  assert.equal(emitter.listenerCount(), 0);
});

test('dismissal without a reward fails and cleans every listener', async () => {
  const emitter = new FakeEmitter();
  const result = await waitForAdLifecycle(
    options(emitter, () => {
      emitter.emit('showed');
      emitter.emit('dismissed');
    }),
  );

  assert.equal(result.success, false);
  assert.equal(result.outcome, 'dismissed-without-reward');
  assert.equal(result.shown, true);
  assert.equal(result.rewarded, false);
  assert.equal(emitter.listenerCount(), 0);
});

test('failed presentation resolves without waiting for dismissal', async () => {
  const emitter = new FakeEmitter();
  const result = await waitForAdLifecycle(
    options(emitter, () => emitter.emit('failedToShow', { code: 3 })),
  );

  assert.equal(result.success, false);
  assert.equal(result.outcome, 'failed-to-show');
  assert.equal(emitter.listenerCount(), 0);
});

test('a second lifecycle can only start after the first one is dismissed', async () => {
  const emitter = new FakeEmitter();
  const sequence: string[] = [];

  const showOne = async (): Promise<boolean> => {
    sequence.push('invoke-first');
    const result = await waitForAdLifecycle(
      options(emitter, () => {
        emitter.emit('showed');
        emitter.emit('rewarded', { amount: 1, type: 'generation' });
        setTimeout(() => emitter.emit('dismissed'), 5);
      }),
    );
    sequence.push('dismissed-first');
    return result.success;
  };

  const first = await showOne();
  assert.equal(first, true);
  sequence.push('start-second');
  const second = await waitForAdLifecycle(
    options(emitter, () => {
      sequence.push('invoke-second');
      emitter.emit('showed');
      emitter.emit('rewarded', { amount: 1, type: 'generation' });
      setTimeout(() => emitter.emit('dismissed'), 5);
    }),
  );

  assert.equal(second.success, true);
  assert.deepEqual(sequence, ['invoke-first', 'dismissed-first', 'start-second', 'invoke-second']);
  assert.equal(emitter.listenerCount(), 0);
});

test('initial timeout is a failure, never a successful completion', async () => {
  const emitter = new FakeEmitter();
  const result = await waitForAdLifecycle({
    subscribe: emitter.subscribe,
    invoke: () => undefined,
    requireReward: true,
    initialTimeoutMs: 5,
    dismissalTimeoutMs: 20,
  });

  assert.equal(result.success, false);
  assert.equal(result.outcome, 'timeout-before-show');
  assert.equal(emitter.listenerCount(), 0);
});

test('post-show watchdog is distinct from the initial timeout', async () => {
  const emitter = new FakeEmitter();
  const result = await waitForAdLifecycle({
    subscribe: emitter.subscribe,
    invoke: () => emitter.emit('showed'),
    requireReward: false,
    initialTimeoutMs: 5,
    dismissalTimeoutMs: 10,
  });

  assert.equal(result.success, false);
  assert.equal(result.shown, true);
  assert.equal(result.outcome, 'timeout-before-dismiss');
  assert.equal(emitter.listenerCount(), 0);
});
