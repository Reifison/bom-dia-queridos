import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { ApiError } from '@google/genai';
import { createApp } from '../server/app';
import { classifyGenerationError } from '../server/apiErrors';
import { buildDailyMessagePrompt, formatGeminiErrorForLog } from '../server/gemini';

async function withApi(options: Parameters<typeof createApp>[0], run: (origin: string) => Promise<void>) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('missing key, invalid authorization, quota, and timeout have distinct diagnostics', () => {
  assert.deepEqual(classifyGenerationError(new Error('GEMINI_API_KEY_MISSING')), { status: 503, code: 'SERVICE_NOT_CONFIGURED' });
  assert.deepEqual(classifyGenerationError(new ApiError({ status: 403, message: 'Forbidden' })), { status: 503, code: 'PROVIDER_AUTH_FAILED' });
  assert.deepEqual(classifyGenerationError(new ApiError({ status: 429, message: 'Quota' })), { status: 429, code: 'QUOTA_EXCEEDED' });
  assert.deepEqual(classifyGenerationError(new ApiError({ status: 404, message: 'Model' })), { status: 503, code: 'MODEL_UNAVAILABLE' });
  assert.deepEqual(classifyGenerationError(new DOMException('Timed out', 'TimeoutError')), { status: 504, code: 'GENERATION_TIMEOUT' });
});

test('provider logs redact the configured secret', () => {
  const original = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'synthetic-test-secret';
  try {
    assert.equal(formatGeminiErrorForLog(new Error('Request used synthetic-test-secret')), 'Request used [REDACTED]');
  } finally {
    if (original === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = original;
  }
});

test('invalid input never calls the generation provider and API paths return JSON 404', async () => {
  let calls = 0;
  await withApi({ generateImage: async () => { calls++; return 'image'; } }, async (origin) => {
    const res = await fetch(`${origin}/api/generate-image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"period":"invalid"}' });
    assert.equal(res.status, 400);
    assert.equal(calls, 0);
    const missing = await fetch(`${origin}/api/missing`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'NOT_FOUND' });
  });
});

test('CORS supports configured web origins and native origins without wildcard access', async () => {
  await withApi({ corsOrigins: ['https://app.example.com'] }, async (origin) => {
    for (const allowed of ['https://app.example.com', 'capacitor://localhost', 'https://localhost']) {
      const res = await fetch(`${origin}/api/generate-image`, { method: 'OPTIONS', headers: { Origin: allowed } });
      assert.equal(res.headers.get('access-control-allow-origin'), allowed);
    }
    const res = await fetch(`${origin}/api/generate-image`, { method: 'OPTIONS', headers: { Origin: 'https://unknown.example.com' } });
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });
});

test('provider failures return a traceable code without leaking provider details', async () => {
  await withApi({ generateMessage: async () => { throw new ApiError({ status: 403, message: 'Private provider detail' }); } }, async (origin) => {
    const res = await fetch(`${origin}/api/generate-message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"period":"morning"}' });
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.error, 'PROVIDER_AUTH_FAILED');
    assert.match(data.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(JSON.stringify(data).includes('Private'), false);
  });
});

test('message generation receives a validated locale and legacy requests default to Portuguese', async () => {
  const calls: Array<[string, string]> = [];
  await withApi({
    generateMessage: async (period, locale) => {
      calls.push([period, locale]);
      return { mainText: locale === 'en' ? 'Good morning!' : 'Bom dia!' };
    },
  }, async (origin) => {
    const generate = (body: unknown) => fetch(`${origin}/api/generate-message`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal((await generate({ period: 'morning', locale: 'en' })).status, 200);
    assert.equal((await generate({ period: 'afternoon' })).status, 200);
    assert.equal((await generate({ period: 'night', locale: 'fr' })).status, 400);
  });
  assert.deepEqual(calls, [['morning', 'en'], ['afternoon', 'pt']]);
});

test('server prompts keep each generated message in its selected language', () => {
  const englishPrompt = buildDailyMessagePrompt('morning', 'en');
  const portuguesePrompt = buildDailyMessagePrompt('morning', 'pt');
  assert.match(englishPrompt, /natural English/);
  assert.match(englishPrompt, /main message/);
  assert.match(portuguesePrompt, /português natural do Brasil/);
  assert.match(portuguesePrompt, /frase principal/);
});
