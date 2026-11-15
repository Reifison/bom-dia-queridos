import assert from 'node:assert/strict';
import { test } from 'node:test';
import { composeMessageArtWithRecovery } from '../src/lib/messageArtRecovery';
import type { BankSelectionOptions } from '../src/lib/personalImageBank';
import type { ShareImageOptions } from '../src/lib/shareImage';

const source = { background: 'broken-ai-image', title: 'Boa noite, queridos!', mainText: 'Bons sonhos.' };

for (const code of ['LOAD_FAILED', 'LOAD_TIMEOUT', 'BACKGROUND_EMPTY', 'BACKGROUND_REQUIRED']) {
  test(`night artwork replaces ${code} with a bank image in both preview and sharing`, async () => {
    const composed: ShareImageOptions[] = [];
    const blob = new Blob(['photo and text'], { type: 'image/jpeg' });
    const replacement = { image: '/images/daily/night-01-moon.jpg', imageId: 'offline:moon', source: 'offline' as const };
    const result = await composeMessageArtWithRecovery(source, 'night', '2026-10-26', {
      compose: async (options) => {
        composed.push(options);
        if (options.background === source.background) throw new Error(`SHARE_IMAGE_${code}`);
        return { blob, width: 1080, height: 1350 };
      },
      select: async (period, day, options) => {
        assert.equal(period, 'night');
        assert.equal(day, '2026-10-26');
        assert.equal(options?.excludeImage, source.background);
        return replacement;
      },
    });
    assert.equal(result.blob, blob);
    assert.equal(result.replacement, replacement);
    assert.deepEqual(composed[1], { ...source, background: replacement.image });
  });
}

test('a second broken bank image is skipped and retries are bounded', async () => {
  const exclusions: Array<BankSelectionOptions | undefined> = [];
  await assert.rejects(composeMessageArtWithRecovery(source, 'night', '2026-10-26', {
    compose: async () => { throw new Error('SHARE_IMAGE_LOAD_FAILED'); },
    select: async (_period, _day, options) => {
      exclusions.push(options);
      return { image: `image-${exclusions.length}`, imageId: `id-${exclusions.length}`, source: 'firebase' };
    },
  }), /LOAD_FAILED/);
  assert.deepEqual(exclusions.map((item) => item?.excludeImage), ['broken-ai-image', 'id-1', 'id-2']);
});

test('unrelated composition failures do not rotate bank photos', async () => {
  await assert.rejects(composeMessageArtWithRecovery(source, 'night', '2026-10-26', {
    compose: async () => { throw new Error('SHARE_IMAGE_CANVAS_UNAVAILABLE'); },
    select: async () => { assert.fail('canvas errors cannot be fixed by changing photos'); },
  }), /CANVAS_UNAVAILABLE/);
});

test('a replacement photo receives compatible text when the original card had a theme', async () => {
  const { GREETING_IMAGES, greetingMessagesForImage } = await import('../src/constants/greetingImages');
  const original = GREETING_IMAGES.night.find(({ theme }) => theme === 'pets')!.src;
  const replacement = GREETING_IMAGES.night.find(({ theme }) => theme === 'light')!;
  const originalText = greetingMessagesForImage('night', original)![0];
  const replacementText = greetingMessagesForImage('night', replacement.src)![0];

  const result = await composeMessageArtWithRecovery(
    { ...source, background: original, mainText: originalText },
    'night',
    '2026-10-26',
    {
      compose: async ({ background, mainText }) => {
        if (background === original) throw new Error('SHARE_IMAGE_LOAD_FAILED');
        assert.equal(background, replacement.src);
        assert.equal(mainText, replacementText);
        return { blob: new Blob(), width: 1080, height: 1350 };
      },
      select: async () => ({ image: replacement.src, imageId: replacement.key, source: 'offline' }),
      selectText: async (_period, _day, options) => {
        assert.equal(options?.image, replacement.src);
        return replacementText;
      },
    },
  );
  assert.equal(result.replacement?.mainText, replacementText);
});
