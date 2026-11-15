import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { greetingMessagesForImage } from '../src/constants/greetingImages';
import { OFFLINE_MESSAGES, OFFLINE_MESSAGES_EN } from '../src/constants/offlineMessages';
import {
  getOfflineDailyMessage,
  getOfflinePeriodCover,
  OFFLINE_DAILY_IMAGES,
} from '../src/lib/offlineDailyContent';
import { messageGreeting } from '../src/lib/messageGreeting';
import type { PeriodId } from '../src/types/period';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const periods: readonly PeriodId[] = ['morning', 'afternoon', 'night'];

test('each period has 50 distinct local photos and at least 30 original offline messages', async () => {
  const allSources = new Set<string>();
  for (const period of periods) {
    assert.ok(OFFLINE_MESSAGES[period].length >= 30, `${period} message bank is too small`);
    assert.equal(new Set(OFFLINE_MESSAGES[period]).size, OFFLINE_MESSAGES[period].length);
    assert.equal(OFFLINE_DAILY_IMAGES[period].length, 50, `${period} must offer 50 photos`);

    for (const image of OFFLINE_DAILY_IMAGES[period]) {
      assert.equal(allSources.has(image.src), false, 'one photo must not be counted in multiple periods');
      allSources.add(image.src);
      assert.match(image.src, /^\/images\/daily\/[a-z0-9-]+\.jpg$/);
      await access(path.join(projectRoot, 'public', image.src.slice(1)));
    }
    await access(path.join(projectRoot, 'public', getOfflinePeriodCover(period).slice(1)));
  }
});

test('daily selection is stable for a date and changes text, photo, and layout the next day', () => {
  const day = '2026-10-26';
  const nextDay = '2026-10-27';

  for (const period of periods) {
    const first = getOfflineDailyMessage(period, day);
    const reopened = getOfflineDailyMessage(period, day);
    const next = getOfflineDailyMessage(period, nextDay);

    assert.deepEqual(reopened, first);
    assert.equal(first.periodId, period);
    assert.equal(first.offline.dayKey, day);
    assert.notEqual(first.mainText, next.mainText);
    assert.notEqual(first.image, next.image);
    assert.notEqual(first.offline.layoutId, next.offline.layoutId);
  }
});

test('variation zero is stable and variation one predictably changes the local composition', () => {
  const day = '2026-10-26';

  for (const period of periods) {
    const defaultChoice = getOfflineDailyMessage(period, day);
    const zeroChoice = getOfflineDailyMessage(period, day, 0);
    const firstVariation = getOfflineDailyMessage(period, day, 1);

    assert.deepEqual(defaultChoice, zeroChoice);
    assert.deepEqual(firstVariation, getOfflineDailyMessage(period, day, 1));
    assert.equal(firstVariation.source, 'offline');
    assert.equal(firstVariation.offline.variation, 1);
    assert.notEqual(firstVariation.mainText, zeroChoice.mainText);
    assert.notEqual(firstVariation.image, zeroChoice.image);
    assert.notEqual(firstVariation.offline.layoutId, zeroChoice.offline.layoutId);
  }
});

test('selection accepts a Period object and handles leap days without using the system clock', () => {
  const fromString = getOfflineDailyMessage('night', '2024-02-29');
  const fromPeriod = getOfflineDailyMessage({ id: 'night' }, '2024-02-29');
  assert.deepEqual(fromPeriod, fromString);
});

test('invalid periods and non-calendar date keys are rejected', () => {
  assert.throws(() => getOfflineDailyMessage('morning', '2026-02-29'), RangeError);
  assert.throws(() => getOfflineDailyMessage('morning', '26-10-2026'), RangeError);
  assert.throws(
    () => getOfflineDailyMessage('dawn' as unknown as PeriodId, '2026-10-26'),
    RangeError,
  );
});

test('negative, fractional, or unsafe variations are rejected', () => {
  for (const variation of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => getOfflineDailyMessage('morning', '2026-10-26', variation), RangeError);
  }
});

test('offline messages and greetings follow the selected Portuguese or English locale', () => {
  const day = '2026-10-26';
  for (const period of periods) {
    const portuguese = getOfflineDailyMessage(period, day, 0, 'pt');
    const english = getOfflineDailyMessage(period, day, 0, 'en');
    assert.ok((greetingMessagesForImage(period, portuguese.image) ?? OFFLINE_MESSAGES[period]).includes(portuguese.mainText));
    assert.equal(english.image, portuguese.image);
    assert.ok((greetingMessagesForImage(period, english.image, 'en') ?? OFFLINE_MESSAGES_EN[period]).includes(english.mainText));
    assert.notEqual(portuguese.mainText, english.mainText);
    assert.equal(OFFLINE_MESSAGES[period].length, OFFLINE_MESSAGES_EN[period].length);
    assert.ok(OFFLINE_MESSAGES_EN[period].length >= 30);
    assert.equal(new Set(OFFLINE_MESSAGES_EN[period]).size, OFFLINE_MESSAGES_EN[period].length);
    for (const message of OFFLINE_MESSAGES_EN[period]) {
      assert.doesNotMatch(message, /[áàâãéêíóôõúç]/i);
      assert.doesNotMatch(message, /\b(você|vocês|amanhã|hoje|que|para)\b/i);
    }
  }
  assert.equal(messageGreeting('morning', 'pt'), 'Bom dia, queridos!');
  assert.equal(messageGreeting('morning', 'en'), 'Good morning, friends!');
  assert.equal(messageGreeting('afternoon', 'en'), 'Good afternoon, friends!');
  assert.equal(messageGreeting('night', 'en'), 'Good night, friends!');
});

test('the new offline images only rotate through the messages for their own period and theme', async () => {
  const { GREETING_IMAGES } = await import('../src/constants/greetingImages');
  const { GREETING_MESSAGES } = await import('../src/constants/greetingMessages');
  const expectedMessages = { morning: 100, afternoon: 50, night: 50 };
  const allImages = new Set<string>();
  for (const period of periods) {
    const texts = Object.values(GREETING_MESSAGES[period]).flat();
    assert.equal(texts.length, expectedMessages[period]);
    assert.equal(new Set(texts).size, texts.length);
    assert.equal(GREETING_IMAGES[period].filter(({ theme }) => theme === 'pets').length, 10);

    for (const image of GREETING_IMAGES[period]) {
      assert.ok(!allImages.has(image.src));
      allImages.add(image.src);
      await access(path.join(projectRoot, 'public', image.src.slice(1)));
      assert.ok(greetingMessagesForImage(period, image.src)?.length);
    }

    const seen = { pt: new Set<string>(), en: new Set<string>() };
    const date = new Date('2026-11-14T00:00:00Z');
    for (let offset = 0; offset < 2_000; offset += 1) {
      const day = date.toISOString().slice(0, 10);
      for (const locale of ['pt', 'en'] as const) {
        const message = getOfflineDailyMessage(period, day, 0, locale);
        const compatible = greetingMessagesForImage(period, message.image, locale);
        if (compatible) {
          assert.ok(compatible.includes(message.mainText));
          seen[locale].add(message.mainText);
        }
      }
      date.setUTCDate(date.getUTCDate() + 1);
    }
    assert.equal(seen.pt.size, expectedMessages[period]);
    assert.equal(seen.en.size, expectedMessages[period]);
    assert.ok([...seen.en].every((text) => !seen.pt.has(text)));
  }
});

test('all 200 collection phrases have a local, cacheable image for their period and occasion', async () => {
  const { MESSAGE_COLLECTIONS, getCollection } = await import('../src/constants/messageCollections');
  const { isOfflineReadyMessage } = await import('../src/types/period');
  const collections = Object.keys(MESSAGE_COLLECTIONS) as (keyof typeof MESSAGE_COLLECTIONS)[];
  const days = Array.from({ length: 7 }, (_, index) => `2026-11-${15 + index}`);
  const counts = [42, 45, 35, 30, 16, 16, 8, 8];
  const allTexts = new Set<string>();
  const allEnglish = new Set<string>();
  for (const [index, collection] of collections.entries()) {
    for (const period of periods) {
      const dates = collection === 'weekday' ? days : days.slice(0, 1);
      const texts = new Set<string>();
      for (const date of dates) {
        const { image, messages } = getCollection(period, date, collection);
        await access(path.join(projectRoot, 'public', image.slice(1)));
        const english = getCollection(period, date, collection, 'en');
        assert.equal(english.image, image);
        assert.equal(english.messages.length, messages.length);
        assert.ok(english.messages.every((text) => !messages.some((original) => original === text)));
        english.messages.forEach((text) => allEnglish.add(text));
        for (const mainText of messages) {
          assert.ok(isOfflineReadyMessage({ periodId: period, source: 'offline', image, mainText }));
          texts.add(mainText);
          allTexts.add(mainText);
        }
      }
      assert.equal(texts.size, counts[index], collection);
    }
  }
  assert.equal(allTexts.size, 200);
  assert.equal(allEnglish.size, 200);
});
