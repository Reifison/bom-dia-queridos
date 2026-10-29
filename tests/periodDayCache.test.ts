import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indexedDB } from 'fake-indexeddb';
import { getTodayLocal, loadPeriodDayMessages, savePeriodDayMessage } from '../src/lib/periodDayCache';
import { isDailyMessage } from '../src/types/period';

Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: indexedDB });
const store = new Map<string, string>();
const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) };
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
const day = '2026-10-26';
const message = { periodId: 'morning' as const, mainText: 'Bom dia!', image: 'data:image/jpeg;base64,aGVsbG8=' };

async function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('bdq_daily_messages.v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('periods');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

test('date keys follow the local date on both sides of midnight', () => {
  assert.equal(getTodayLocal(new Date(2026, 9, 26, 23, 59)), day);
  assert.equal(getTodayLocal(new Date(2026, 9, 27, 0, 0)), '2026-10-27');
});

test('personal-photo text position survives persistent cache reload', async () => {
  const personal = { ...message, source: 'personal' as const, textPosition: { x: 0.47, y: 0.72 } };
  await savePeriodDayMessage('morning', day, personal);
  assert.deepEqual((await loadPeriodDayMessages(day)).morning?.message.textPosition, personal.textPosition);
});

test('legacy messages stay valid while invalid saved positions are rejected', () => {
  assert.equal(isDailyMessage(message), true);
  for (const textPosition of [null, { x: NaN, y: 0.5 }, { x: 0.5, y: Infinity }, { x: -1, y: 0.5 }, { x: 0.5 }, { x: 0.5, y: 2 }]) {
    assert.equal(isDailyMessage({ ...message, textPosition }), false);
  }
});

test('an image is committed to persistent IndexedDB, not only session storage', async () => {
  await savePeriodDayMessage('morning', day, message, 'pt');
  const db = await openDatabase();
  const entry = await new Promise((resolve, reject) => {
    const request = db.transaction('periods').objectStore('periods').get('morning');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  assert.equal((entry as {day: string}).day, day);
  assert.deepEqual((entry as {message: unknown}).message, message);
  assert.ok((entry as {updatedAt: number}).updatedAt > 0);
  assert.equal(store.has('bdq_periodDay_morning'), false);
});

test('previously stored content is restored and yesterday/corrupt entries are ignored', async () => {
  const db = await openDatabase();
  const afternoon = { ...message, periodId: 'afternoon', mainText: 'Persistida em outra sessão' };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('periods', 'readwrite');
    tx.objectStore('periods').put({ day, message: afternoon }, 'afternoon');
    tx.objectStore('periods').put({ day, message: { periodId: 'night' } }, 'night');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  const today = await loadPeriodDayMessages(day, 'pt');
  assert.deepEqual(today.afternoon?.message, afternoon);
  assert.equal(today.night, undefined);
  assert.deepEqual(await loadPeriodDayMessages('2026-10-27'), {});
});

test('legacy session messages remain readable during migration', async () => {
  store.set('bdq_periodDay_night', JSON.stringify({ day, message: { ...message, periodId: 'night' } }));
  assert.equal((await loadPeriodDayMessages(day, 'pt')).night?.message.mainText, 'Bom dia!');
});

test('a newer local fallback wins over an older IndexedDB record after a failed write', async () => {
  const newer = { ...message, periodId: 'afternoon', mainText: 'Mais recente no fallback' };
  store.set('bdq_periodDay_persistent_afternoon', JSON.stringify({ day, message: newer, updatedAt: Date.now() + 1000 }));
  assert.equal((await loadPeriodDayMessages(day)).afternoon?.message.mainText, newer.mainText);
});

test('a slow initial cache write cannot overwrite a newer manual photo and its generation progress', async (t) => {
  const factory = globalThis.indexedDB;
  let first = true;
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {
    open(name: string, version: number) {
      const request = factory.open(name, version);
      if (!first) return request;
      first = false;
      return new Proxy(request, {
        get(target, key) { return Reflect.get(target, key, target); },
        set(target, key, value) {
          if (key === 'onsuccess') target.onsuccess = (event) => { setTimeout(() => value(event), 20); };
          else Reflect.set(target, key, value, target);
          return true;
        },
      });
    },
  } });
  t.after(() => Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory }));
  const slow = savePeriodDayMessage('morning', day, message, 'pt');
  const personal = { ...message, source: 'personal' as const, generationFlow: { day, manualBankRefreshes: 1 } };
  await savePeriodDayMessage('morning', day, personal, 'pt');
  await slow;
  const db = await openDatabase();
  const entry = await new Promise<{ message: typeof personal }>((resolve, reject) => {
    const request = db.transaction('periods').objectStore('periods').get('morning');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  assert.deepEqual(entry.message, personal);
});

test('Portuguese and English daily messages persist under separate locale keys', async () => {
  const englishDay = '2026-10-28';
  const portuguese = { ...message, mainText: 'Bom dia!' };
  const english = { ...message, mainText: 'Good morning!' };
  await savePeriodDayMessage('morning', englishDay, portuguese, 'pt');
  await savePeriodDayMessage('morning', englishDay, english, 'en');

  assert.equal((await loadPeriodDayMessages(englishDay, 'pt')).morning?.message.mainText, portuguese.mainText);
  assert.equal((await loadPeriodDayMessages(englishDay, 'en')).morning?.message.mainText, english.mainText);
  const db = await openDatabase();
  const values = await new Promise<{ pt: unknown; en: unknown }>((resolve, reject) => {
    const store = db.transaction('periods').objectStore('periods');
    const ptRequest = store.get('morning');
    const enRequest = store.get('en:morning');
    let count = 0;
    const finish = () => {
      if (++count !== 2) return;
      resolve({ pt: ptRequest.result, en: enRequest.result });
    };
    ptRequest.onsuccess = finish;
    enRequest.onsuccess = finish;
    ptRequest.onerror = enRequest.onerror = () => reject(db.transaction('periods').error);
  });
  db.close();
  assert.equal((values.pt as { message: { mainText: string } }).message.mainText, portuguese.mainText);
  assert.equal((values.en as { message: { mainText: string } }).message.mainText, english.mainText);
});
