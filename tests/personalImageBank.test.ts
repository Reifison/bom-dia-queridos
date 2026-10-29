import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory, indexedDB } from 'fake-indexeddb';
import { OFFLINE_DAILY_IMAGES } from '../src/lib/offlineDailyContent';
import { OFFLINE_MESSAGES, OFFLINE_MESSAGES_EN } from '../src/constants/offlineMessages';
import {
  addGeneratedBankImage,
  BankImageStorageError,
  selectBankImage,
  selectBankMessage,
  PERSONAL_BANK_DB_NAME,
} from '../src/lib/personalImageBank';

Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: indexedDB });
const localValues = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => localValues.get(key) ?? null,
    setItem: (key: string, value: string) => localValues.set(key, value),
    removeItem: (key: string) => localValues.delete(key),
  },
});

const day = '2026-10-26';
const generatedImage = 'data:image/jpeg;base64,aGVsbG8=';

function dayAfter(offset: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function openBank(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PERSONAL_BANK_DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      const images = db.objectStoreNames.contains('images')
        ? request.transaction!.objectStore('images')
        : db.createObjectStore('images', { keyPath: 'imageId' });
      if (!images.indexNames.contains('periods')) images.createIndex('periods', 'periods', { multiEntry: true });
      if (!db.objectStoreNames.contains('image-history')) db.createObjectStore('image-history');
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

test('personal bank rotates bundled photos, persists AI images, deduplicates, and tracks messages', async (t) => {
  const imagePool = [...new Set(OFFLINE_DAILY_IMAGES.morning.map((image) => image.src))];
  const first = await selectBankImage('morning', day, { rng: () => 0 });
  const afterReload = await import('../src/lib/personalImageBank.ts?image-reload-check');
  const second = await afterReload.selectBankImage('morning', '2026-10-27', { rng: () => 0 });
  assert.notEqual(first.imageId, second.imageId, 'a fresh module must read the persisted recent-photo history');

  const selectedIds = new Set([first.imageId, second.imageId]);
  for (let index = selectedIds.size; index < imagePool.length; index += 1) {
    const selection = await selectBankImage('morning', dayAfter(index + 2), { rng: () => 0 });
    assert.equal(selectedIds.has(selection.imageId), false, 'unused bundled photos should be preferred before a repeat');
    selectedIds.add(selection.imageId);
  }
  assert.equal(selectedIds.size, imagePool.length);
  const afterPool = await selectBankImage('morning', '2026-11-05', { rng: () => 0 });
  assert.notEqual(afterPool.imageId, [...selectedIds].at(-1), 'a pool with multiple photos must not repeat immediately');

  const addedMorning = await addGeneratedBankImage('morning', generatedImage, '2026-11-06');
  const addedAfternoon = await addGeneratedBankImage('afternoon', generatedImage, '2026-11-06');
  assert.equal(addedAfternoon.imageId, addedMorning.imageId, 'identical image bytes should have a stable deduplicated ID');

  const reloadedBank = await import('../src/lib/personalImageBank.ts?generated-reload-check');
  let onlyGenerated = await reloadedBank.selectBankImage('morning', '2026-11-07', { rng: () => 0 });
  for (let index = 0; onlyGenerated.imageId !== addedMorning.imageId && index < imagePool.length + 2; index += 1) {
    onlyGenerated = await reloadedBank.selectBankImage('morning', dayAfter(12 + index), { rng: () => 0 });
  }
  assert.equal(onlyGenerated.imageId, addedMorning.imageId, 'the generated image should be restored from IndexedDB after reload');
  assert.equal(onlyGenerated.image, generatedImage);

  const db = await openBank();
  const records = await new Promise<unknown[]>((resolve, reject) => {
    const request = db.transaction('images').objectStore('images').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  assert.equal(records.length, 1, 'duplicate generation should not create another image record');
  assert.deepEqual((records[0] as { periods: string[] }).periods.sort(), ['afternoon', 'morning']);
  assert.equal([...localValues.values()].some((value) => value.includes('data:image/')), false, 'localStorage must contain metadata only');

  const messages = OFFLINE_MESSAGES.morning;
  const chosenMessages: string[] = [];
  for (let index = 0; index < Math.min(5, messages.length); index += 1) {
    chosenMessages.push(await selectBankMessage('morning', dayAfter(20 + index), { rng: () => 0 }));
  }
  assert.equal(new Set(chosenMessages).size, chosenMessages.length, 'the period message pool should avoid recent repetitions');
  const reloadedMessages = await import('../src/lib/personalImageBank.ts?message-reload-check');
  const afterMessageReload = await reloadedMessages.selectBankMessage('morning', dayAfter(30), { rng: () => 0 });
  assert.equal(chosenMessages.includes(afterMessageReload), false, 'message history should survive a module reload');
  const excludingLast = await selectBankMessage('morning', '2026-11-21', {
    excludeText: afterMessageReload,
    rng: () => 0,
  });
  assert.notEqual(excludingLast, afterMessageReload);

  await t.test('add surfaces a storage error when IndexedDB is unavailable', async () => {
    const original = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
    try {
      await assert.rejects(
        addGeneratedBankImage('night', 'data:image/png;base64,aGVsbG8=', '2026-11-22'),
        (error: unknown) => error instanceof BankImageStorageError,
      );
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: original });
    }
    const recovered = await addGeneratedBankImage('night', 'data:image/png;base64,aGVsbG8=', dayAfter(40));
    assert.equal(recovered.source, 'firebase', 'a later write should succeed once IndexedDB is available again');
    assert.equal(recovered.imageId, addedMorning.imageId, 'recovery should still deduplicate the saved image bytes');
  });
});

test('fallback rotates every period completely and reuses a photo with another phrase', async () => {
  const originalIndexedDB = globalThis.indexedDB;
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
  localValues.clear();
  try {
    const bank = await import('../src/lib/personalImageBank.ts?expanded-fallback-rotation');
    const periods = ['morning', 'afternoon', 'night'] as const;
    const selected = new Map(periods.map((period) => [period, new Set<string>()]));
    const firstPair = new Map<string, { imageId: string; text: string }>();
    for (let round = 0; round < 50; round += 1) {
      for (const period of periods) {
        const image = await bank.selectBankImage(period, dayAfter(round), { rng: () => 0 });
        const text = await bank.selectBankMessage(period, dayAfter(round), { rng: () => 0 });
        assert.equal(selected.get(period)!.has(image.imageId), false, `${period} repeated before all 50 photos were used`);
        selected.get(period)!.add(image.imageId);
        if (round === 0) firstPair.set(period, { imageId: image.imageId, text });
      }
    }
    // Simulate reloading the app after 150 interleaved choices, with no IndexedDB.
    const reloaded = await import('../src/lib/personalImageBank.ts?expanded-fallback-reload');
    for (const period of periods) {
      const image = await reloaded.selectBankImage(period, dayAfter(50), { rng: () => 0 });
      const text = await reloaded.selectBankMessage(period, dayAfter(50), { rng: () => 0 });
      assert.equal(image.imageId, firstPair.get(period)!.imageId, 'a completed rotation may reuse the oldest photo');
      assert.notEqual(text, firstPair.get(period)!.text, 'the photo must be independent from its original phrase');
    }
  } finally {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originalIndexedDB });
    localValues.clear();
  }
});

test('schema 1 images are indexed on upgrade without losing their data', async () => {
  const previousIndexedDB = globalThis.indexedDB;
  const isolatedFactory = new IDBFactory();
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: isolatedFactory });
  localValues.clear();

  try {
    const fixtureId = 'firebase:checksum:migration-fixture';
    const fixture = {
      imageId: fixtureId,
      image: generatedImage,
      source: 'firebase' as const,
      checksum: 'migration-fixture',
      periods: ['afternoon' as const],
      addedAt: 1,
    };
    const v1Database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = isolatedFactory.open(PERSONAL_BANK_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('images', { keyPath: 'imageId' });
        db.createObjectStore('image-history');
        db.createObjectStore('state');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const oldBundledPhotos = [...new Set(OFFLINE_DAILY_IMAGES.afternoon.map((image) => image.src))];
    await new Promise<void>((resolve, reject) => {
      const transaction = v1Database.transaction(['images', 'image-history', 'state'], 'readwrite');
      transaction.objectStore('images').put(fixture);
      oldBundledPhotos.forEach((src, index) => {
        const imageId = `offline:${src}`;
        transaction.objectStore('image-history').put({
          imageId,
          globalLastUsedSequence: index + 1,
          lastUsedPeriod: 'afternoon',
          lastUsedDay: '2026-10-25',
        }, imageId);
      });
      transaction.objectStore('state').put(oldBundledPhotos.length, 'sequence');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    v1Database.close();

    const migratedBank = await import('../src/lib/personalImageBank.ts?schema-v2-migration-check');
    const selected = await migratedBank.selectBankImage('afternoon', day, { rng: () => 0 });
    assert.equal(selected.imageId, fixtureId, 'the new periods index should expose the existing v1 image to selection');
    assert.equal(selected.image, generatedImage);

    const migratedDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = isolatedFactory.open(PERSONAL_BANK_DB_NAME, 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    assert.equal(migratedDatabase.version, 2);
    const imagesStore = migratedDatabase.transaction('images').objectStore('images');
    assert.equal(imagesStore.indexNames.contains('periods'), true);
    assert.equal(imagesStore.index('periods').multiEntry, true);
    const preserved = await new Promise<unknown>((resolve, reject) => {
      const request = imagesStore.get(fixtureId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    migratedDatabase.close();
    assert.deepEqual(preserved, fixture, 'upgrade must preserve the image record and data URL');
  } finally {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: previousIndexedDB });
    localValues.clear();
  }
});

test('offline message selection uses independent language banks and history', async () => {
  const portuguese = await selectBankMessage('morning', dayAfter(100), { locale: 'pt', rng: () => 0 });
  const english = await selectBankMessage('morning', dayAfter(101), { locale: 'en', rng: () => 0 });
  assert.ok(OFFLINE_MESSAGES.morning.includes(portuguese));
  assert.ok(OFFLINE_MESSAGES_EN.morning.includes(english));
  assert.notEqual(portuguese, english);

  const nextEnglish = await selectBankMessage('morning', dayAfter(102), { locale: 'en', rng: () => 0 });
  assert.notEqual(nextEnglish, english, 'English history should prevent an immediate English repeat');
});
