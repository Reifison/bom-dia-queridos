import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createDailyMessageLoader, generationErrorMessage, loadDailyQuota, saveDailyQuota } from '../src/lib/dailyGeneration';

const data = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => data.set(key, value),
} });
beforeEach(() => data.clear());
const image = 'data:image/jpeg;base64,aGVsbG8=';

test('a used quota resets for the next local day, keeping periods independent', () => {
  saveDailyQuota({ day: '2026-10-26', remaining: { morning: 0, afternoon: 1, night: 0 } });
  assert.deepEqual(loadDailyQuota('2026-10-26').remaining, { morning: 0, afternoon: 1, night: 0 });
  assert.deepEqual(loadDailyQuota('2026-10-27').remaining, { morning: 1, afternoon: 1, night: 1 });
});

test('corrupted local quota never yields NaN or negative credits', () => {
  data.set('bdq_daily_generation_quota.v1', JSON.stringify({ day: '2026-10-26', remaining: { morning: 'bad', afternoon: -1, night: 999 } }));
  assert.deepEqual(loadDailyQuota('2026-10-26').remaining, { morning: 1, afternoon: 1, night: 1 });
});

test('repeated effects share one image request and one text request', async () => {
  let finish!: (value: string) => void;
  let textCalls = 0;
  let imageCalls = 0;
  const loader = createDailyMessageLoader(
    async () => { textCalls++; return { mainText: 'Bom dia!' }; },
    () => { imageCalls++; return new Promise((resolve) => { finish = resolve; }); },
  );
  const first = loader.load('morning', '2026-10-26');
  const duplicate = loader.load('morning', '2026-10-26');
  assert.equal(first, duplicate);
  assert.equal(loader.isPending('morning', '2026-10-26'), true);
  finish(image);
  assert.equal((await first).image, image);
  assert.equal(textCalls, 1);
  assert.equal(imageCalls, 1);
  assert.equal(loader.isPending('morning', '2026-10-26'), false);
});

test('retrying failed text keeps the image that already succeeded', async () => {
  let textCalls = 0;
  let imageCalls = 0;
  const loader = createDailyMessageLoader(
    async () => { if (++textCalls === 1) throw new Error('PROVIDER_UNAVAILABLE'); return { mainText: 'Boa tarde!' }; },
    async () => { imageCalls++; return image; },
  );
  await assert.rejects(loader.load('afternoon', '2026-10-26'), /PROVIDER_UNAVAILABLE/);
  assert.equal((await loader.load('afternoon', '2026-10-26')).mainText, 'Boa tarde!');
  assert.equal(textCalls, 2);
  assert.equal(imageCalls, 1);
});

test('different days never share a generated result or a pending request', async () => {
  let calls = 0;
  const loader = createDailyMessageLoader(async () => ({ mainText: 'Boa noite!' }), async () => { calls++; return image; });
  const first = loader.load('night', '2026-10-26');
  const next = loader.load('night', '2026-10-27');
  assert.notEqual(first, next);
  await Promise.all([first, next]);
  assert.equal(calls, 2);
});

test('pending generated content is isolated by locale for the same date and period', async () => {
  const locales: string[] = [];
  let imageCalls = 0;
  const loader = createDailyMessageLoader(
    async (_period, locale) => { locales.push(locale); return { mainText: locale === 'en' ? 'Good morning!' : 'Bom dia!' }; },
    async () => { imageCalls += 1; return image; },
  );
  const portuguese = loader.load('morning', '2026-10-26', 'pt');
  const english = loader.load('morning', '2026-10-26', 'en');
  assert.notEqual(portuguese, english);
  assert.equal((await portuguese).mainText, 'Bom dia!');
  assert.equal((await english).mainText, 'Good morning!');
  assert.deepEqual(locales.sort(), ['en', 'pt']);
  assert.equal(imageCalls, 2);
});

test('invalid image responses are retryable and never become valid messages', async () => {
  let calls = 0;
  const loader = createDailyMessageLoader(async () => ({ mainText: 'Bom dia!' }), async () => ++calls === 1 ? '' : image);
  await assert.rejects(loader.load('morning', '2026-10-26'), /INVALID_GENERATION_RESPONSE/);
  assert.equal((await loader.load('morning', '2026-10-26')).image, image);
});

test('timeout and API quota errors have distinct user messages', () => {
  assert.match(generationErrorMessage(new DOMException('Timed out', 'TimeoutError')), /demorou/);
  assert.notEqual(generationErrorMessage(new Error('RATE_LIMITED')), generationErrorMessage(new Error('QUOTA_EXCEEDED')));
});
