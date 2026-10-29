import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { generateDailyImage, generateDailyMessage, postJson } from '../src/services/geminiService';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const respond = (data: unknown, status = 200) => { globalThis.fetch = async () => new Response(JSON.stringify(data), { status }); };

test('successful HTTP responses still require nonempty text and image fields', async () => {
  respond({});
  await assert.rejects(generateDailyMessage('morning'), /INVALID_GENERATION_RESPONSE/);
  await assert.rejects(generateDailyImage('morning'), /INVALID_GENERATION_RESPONSE/);
  respond({ mainText: ' ', image: 'not-an-image' });
  await assert.rejects(generateDailyMessage('morning'), /INVALID_GENERATION_RESPONSE/);
  await assert.rejects(generateDailyImage('morning'), /INVALID_GENERATION_RESPONSE/);
});

test('daily message generation sends the selected locale to the server', async () => {
  let requestBody: unknown;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(String(options?.body));
    return new Response(JSON.stringify({ mainText: 'Good morning!' }), { status: 200 });
  };
  assert.deepEqual(await generateDailyMessage('morning', 'en'), { mainText: 'Good morning!' });
  assert.deepEqual(requestBody, { period: 'morning', locale: 'en' });
});

test('HTML fallback pages cannot masquerade as successful API responses', async () => {
  globalThis.fetch = async () => new Response('<html></html>', { status: 200 });
  await assert.rejects(generateDailyMessage('night'), /INVALID_GENERATION_RESPONSE/);
});

test('server error code and HTTP status survive the client boundary', async () => {
  respond({ error: 'PROVIDER_AUTH_FAILED', requestId: 'test-request' }, 503);
  await assert.rejects(generateDailyMessage('afternoon'), (error: Error & { httpStatus: number }) => {
    assert.equal(error.message, 'PROVIDER_AUTH_FAILED');
    assert.equal(error.httpStatus, 503);
    return true;
  });
});

test('a stalled request is aborted within the configured timeout', async () => {
  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
    const keepAlive = setTimeout(() => reject(new Error('Request was never aborted')), 250);
    options!.signal!.addEventListener('abort', () => {
      clearTimeout(keepAlive);
      reject(options!.signal!.reason);
    }, { once: true });
  });
  await assert.rejects(postJson('/api/generate-image', { period: 'morning' }, 10), /GENERATION_TIMEOUT/);
});
