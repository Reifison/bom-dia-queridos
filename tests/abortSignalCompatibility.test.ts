import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureAbortSignalAny } from '../src/lib/abortSignalCompatibility';

test('older WebViews combine cancellation and propagate the first reason', () => {
  const old = {} as typeof AbortSignal;
  ensureAbortSignalAny(old);
  const first = new AbortController();
  const second = new AbortController();
  const result = old.any([first.signal, second.signal]);
  second.abort('second signal');
  assert.equal(result.aborted, true);
  assert.equal(result.reason, 'second signal');
  first.abort('too late');
  assert.equal(result.reason, 'second signal');
});

test('already cancelled input aborts immediately, and native support is preserved', () => {
  const old = {} as typeof AbortSignal;
  ensureAbortSignalAny(old);
  const cancelled = new AbortController();
  cancelled.abort('cancelled');
  assert.equal(old.any([cancelled.signal]).reason, 'cancelled');
  const native = AbortSignal.any;
  ensureAbortSignalAny();
  assert.equal(AbortSignal.any, native);
});
