import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {
  createPersonalPhotoService,
  PersonalPhotoError,
} from '../src/services/personalPhotoService';

function jpegBytes(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
}

function pngBytes(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
    (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
    0x08, 0x06, 0x00, 0x00, 0x00,
  ]);
}

function dataUrl(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

function cameraRuntime(
  getPhoto: (options: Record<string, unknown>) => Promise<{ dataUrl?: unknown }>,
) {
  const options: Record<string, unknown>[] = [];
  return {
    options,
    runtime: {
      Camera: {
        async getPhoto(input: Record<string, unknown>) {
          options.push(input);
          return getPhoto(input);
        },
      },
      CameraSource: { Photos: 'PHOTOS' },
      CameraResultType: { DataUrl: 'dataUrl' },
    },
  };
}

function setGlobal(t: TestContext, name: string, value: unknown): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else Reflect.deleteProperty(globalThis, name);
  });
}

function browserFixture(
  t: TestContext,
  imageSize: { width: number; height: number },
  options: { neverDecode?: boolean } = {},
) {
  const state = {
    canvasWidth: 0,
    canvasHeight: 0,
    quality: 0,
    draw: [] as unknown[],
    revoked: [] as string[],
    images: [] as Array<{ src: string; onload: unknown; onerror: unknown }>,
  };

  class FakeImage {
    naturalWidth = imageSize.width;
    naturalHeight = imageSize.height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    src = '';

    constructor() {
      state.images.push(this);
    }

    decode(): Promise<void> {
      return options.neverDecode ? new Promise(() => {}) : Promise.resolve();
    }
  }

  class FakeFileReader {
    result: string | ArrayBuffer | null = null;
    error: DOMException | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;

    readAsDataURL(blob: Blob): void {
      void blob.arrayBuffer().then((buffer) => {
        this.result = dataUrl(blob.type, new Uint8Array(buffer));
        this.onload?.();
      });
    }

    abort(): void {
      this.onabort?.();
    }
  }

  const context = {
    fillStyle: '',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    fillRect() {},
    drawImage(...args: unknown[]) { state.draw = args; },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext() { return context; },
    toBlob(callback: (blob: Blob | null) => void, type: string, quality: number) {
      state.canvasWidth = this.width;
      state.canvasHeight = this.height;
      state.quality = quality;
      callback(new Blob([jpegBytes(2, 3)], { type }));
    },
  };

  const FakeUrl = class {};
  Object.assign(FakeUrl, {
    createObjectURL: () => 'blob:personal-photo-test',
    revokeObjectURL: (value: string) => state.revoked.push(value),
  });

  setGlobal(t, 'Image', FakeImage);
  setGlobal(t, 'FileReader', FakeFileReader);
  setGlobal(t, 'URL', FakeUrl);
  setGlobal(t, 'document', { createElement: () => canvas });
  return { state, canvas, context };
}

test('picker selects only from Photos and returns a canonical JPEG data URL', async () => {
  const selected = dataUrl('image/jpeg', jpegBytes(960, 1200));
  const { options, runtime } = cameraRuntime(async () => ({ dataUrl: selected }));
  const service = createPersonalPhotoService({ loadCamera: async () => runtime });

  assert.equal(await service.pickPersonalPhoto(), selected);
  assert.deepEqual(options, [{
    source: 'PHOTOS',
    resultType: 'dataUrl',
    quality: 85,
    width: 1200,
    height: 1500,
    correctOrientation: true,
    webUseInput: true,
  }]);
});

test('gallery cancellation returns null for the plugin code and legacy message', async () => {
  for (const error of [
    Object.assign(new Error('Could not choose media'), { code: 'OS-PLUG-CAMR-0020' }),
    new Error('User cancelled photos app'),
  ]) {
    const { runtime } = cameraRuntime(async () => { throw error; });
    const service = createPersonalPhotoService({ loadCamera: async () => runtime });
    assert.equal(await service.pickPersonalPhoto(), null);
  }
});

test('permission denial remains an error with a Portuguese user message', async () => {
  const denial = Object.assign(new Error("Couldn't access your photo gallery because access wasn't provided."), {
    code: 'OS-PLUG-CAMR-0005',
  });
  const { runtime } = cameraRuntime(async () => { throw denial; });
  const service = createPersonalPhotoService({ loadCamera: async () => runtime });

  await assert.rejects(service.pickPersonalPhoto(), (error: PersonalPhotoError) => {
    assert.equal(error.code, 'PERSONAL_PHOTO_PERMISSION_DENIED');
    assert.match(error.userMessage, /permissão/i);
    return true;
  });
});

test('input validation rejects spoofed, non-raster, and oversized images before decoding', async () => {
  const cases = [
    { input: dataUrl('image/png', jpegBytes(4, 4)), code: 'PERSONAL_PHOTO_INVALID_IMAGE' },
    { input: `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`, code: 'PERSONAL_PHOTO_UNSUPPORTED_IMAGE' },
    { input: dataUrl('image/png', pngBytes(100_001, 1)), code: 'PERSONAL_PHOTO_TOO_LARGE' },
  ];

  for (const item of cases) {
    const { runtime } = cameraRuntime(async () => ({ dataUrl: item.input }));
    const service = createPersonalPhotoService({ loadCamera: async () => runtime });
    await assert.rejects(service.pickPersonalPhoto(), (error: PersonalPhotoError) => {
      assert.equal(error.code, item.code);
      assert.ok(error.userMessage.length > 0);
      return true;
    });
  }
});

test('bank preparation keeps the aspect ratio, caps the longest side, and emits JPEG at quality 0.85', async (t) => {
  const { state, canvas } = browserFixture(t, { width: 640, height: 3200 });
  const service = createPersonalPhotoService();
  const result = await service.prepareImageForBank(dataUrl('image/png', pngBytes(640, 3200)));

  assert.equal(state.canvasWidth, 256);
  assert.equal(state.canvasHeight, 1280);
  assert.equal(state.quality, 0.85);
  assert.match(result, /^data:image\/jpeg;base64,/);
  assert.equal(state.revoked.length, 1);
  assert.equal(state.images[0].src, '');
});

test('bank preparation draws decoded bitmap pixels and releases them after JPEG export', async (t) => {
  const { state } = browserFixture(t, { width: 640, height: 800 });
  let closed = false;
  const bitmap = { width: 2048, height: 1024, close() { closed = true; } };
  setGlobal(t, 'createImageBitmap', async () => bitmap);
  const result = await createPersonalPhotoService().prepareImageForBank(dataUrl('image/png', pngBytes(2048, 1024)));
  assert.match(result, /^data:image\/jpeg;base64,/);
  assert.equal(state.draw[0], bitmap);
  assert.equal(state.canvasWidth, 1280);
  assert.equal(state.canvasHeight, 640);
  assert.equal(closed, true);
  assert.equal(state.images.length, 0);
});

test('unsupported bitmap decoding falls back to the HTML image path', async (t) => {
  const { state } = browserFixture(t, { width: 640, height: 800 });
  setGlobal(t, 'createImageBitmap', async () => { throw new Error('Not supported'); });
  assert.match(await createPersonalPhotoService().prepareImageForBank(dataUrl('image/png', pngBytes(640, 800))), /^data:image\/jpeg;base64,/);
  assert.equal(state.images.length, 1);
  assert.equal(state.revoked.length, 1);
});

test('stalled image decoding times out and releases the temporary object URL', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state } = browserFixture(t, { width: 640, height: 800 }, { neverDecode: true });
  const service = createPersonalPhotoService();
  const result = service.prepareImageForBank(dataUrl('image/png', pngBytes(640, 800)));

  await Promise.resolve();
  t.mock.timers.tick(15_000);
  await assert.rejects(result, (error: PersonalPhotoError) => {
    assert.equal(error.code, 'PERSONAL_PHOTO_TIMEOUT');
    return true;
  });
  assert.equal(state.revoked.length, 1);
  assert.equal(state.images[0].src, '');
});

test('blank AI images are rejected before saving to the bank', async (t) => {
  const { context, state } = browserFixture(t, { width: 640, height: 800 });
  Object.assign(context, { getImageData: () => ({ data: new Uint8ClampedArray(64).fill(255) }) });
  await assert.rejects(createPersonalPhotoService().prepareImageForBank(dataUrl('image/png', pngBytes(640, 800))), /PERSONAL_PHOTO_PROCESSING_FAILED/);
  assert.equal(state.quality, 0, 'the empty photo was never exported');
  assert.equal(state.revoked.length, 1);
});
