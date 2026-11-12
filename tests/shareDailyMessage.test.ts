import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { copyTextToClipboard, shareDailyMessage, isShareCancellation } from '../src/services/shareDailyMessage';

function setGlobal(t: TestContext, name: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else Reflect.deleteProperty(globalThis, name);
  });
}

test('sharing sends only the rendered image with no separate text, title, or URL', async (t) => {
  let shared: ShareData | undefined;
  setGlobal(t, 'navigator', {
    canShare: () => true,
    share: async (data: ShareData) => { shared = data; },
    clipboard: { writeText: () => assert.fail('sharing must not copy a caption') },
  });
  const image = new Blob(['image with embedded message'], { type: 'image/jpeg' });
  assert.equal(await shareDailyMessage(image), 'shared');
  assert.deepEqual(Object.keys(shared!), ['files']);
  assert.equal(shared!.files!.length, 1);
  assert.equal(await shared!.files![0].text(), await image.text());
});

test('image download fallback does not copy or send a separate message', async (t) => {
  let downloaded = false;
  const anchor = { href: '', download: '', rel: '', style: {}, click: () => { downloaded = true; }, remove() {} };
  setGlobal(t, 'navigator', { clipboard: { writeText: () => assert.fail('download must not copy a caption') } });
  setGlobal(t, 'document', { createElement: () => anchor, body: { appendChild() {} } });
  setGlobal(t, 'window', { setTimeout: (callback: () => void) => { callback(); } });
  assert.equal(await shareDailyMessage(new Blob(['image'], { type: 'image/jpeg' })), 'downloaded');
  assert.equal(downloaded, true);
  assert.equal(anchor.download, 'mensagem-do-dia.jpg');
});

test('cancelling image sharing does not download or copy anything', async (t) => {
  setGlobal(t, 'navigator', {
    canShare: () => true,
    share: async () => { throw new DOMException('Cancelled', 'AbortError'); },
    clipboard: { writeText: () => assert.fail('cancellation must not copy a caption') },
  });
  assert.equal(await shareDailyMessage(new Blob(['image'])), 'cancelled');
});

test('a pending browser clipboard permission cannot keep sharing busy indefinitely', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: () => new Promise<void>(() => {}) } },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else Reflect.deleteProperty(globalThis, 'navigator');
  });
  const copying = copyTextToClipboard('Boa tarde queridos!');
  t.mock.timers.tick(2_000);
  assert.equal(await copying, false);
});


test('iOS share cancellation is normal while presentation failures remain errors', () => {
  assert.equal(isShareCancellation({ message: 'Share canceled' }), true);
  assert.equal(isShareCancellation({ errorMessage: 'Share canceled' }), true);
  assert.equal(isShareCancellation(new DOMException('Cancelled', 'AbortError')), true);
  assert.equal(isShareCancellation({ message: "Can't share while sharing is in progress" }), false);
  assert.equal(isShareCancellation(new Error('Error sharing item')), false);
});
