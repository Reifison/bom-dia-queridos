import { isDailyMessage, type DailyMessage, type PeriodId } from '../types/period';
import { getAppLocale, type AppLocale } from './locale';

const PERIOD_IDS: PeriodId[] = ['morning', 'afternoon', 'night'];
const DB_NAME = 'bdq_daily_messages.v1';
const STORE_NAME = 'periods';
const memoryCache: Partial<Record<string, PeriodDayEntry>> = {};

export function getTodayLocal(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type PeriodDayEntry = { day: string; message: DailyMessage; locale?: AppLocale; updatedAt?: number };

function cacheId(period: PeriodId, locale: AppLocale): string {
  return `${locale}:${period}`;
}

function persistentKey(period: PeriodId, locale: AppLocale): string {
  return locale === 'pt'
    ? `bdq_periodDay_persistent_${period}`
    : `bdq_periodDay_persistent_${locale}_${period}`;
}

function sessionKey(period: PeriodId, locale: AppLocale): string {
  return locale === 'pt' ? `bdq_periodDay_${period}` : `bdq_periodDay_${locale}_${period}`;
}

function storageKey(period: PeriodId, locale: AppLocale): string {
  return locale === 'pt' ? period : `${locale}:${period}`;
}

function entryLocale(entry: Partial<PeriodDayEntry>): AppLocale | null {
  if (entry.locale === undefined) return 'pt'; // Entries written before locale support were Portuguese.
  return entry.locale === 'pt' || entry.locale === 'en' ? entry.locale : null;
}

function revision(entry: PeriodDayEntry): number {
  return Number.isFinite(entry.updatedAt) ? entry.updatedAt! : 0;
}

function isEntry(value: unknown, id: PeriodId, day: string, locale: AppLocale): value is PeriodDayEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<PeriodDayEntry>;
  return entry.day === day && entryLocale(entry) === locale && isDailyMessage(entry.message) && entry.message.periodId === id;
}

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(DB_NAME, 1); }
    catch (error) { reject(error); return; }
    let expired = false;
    const timeout = setTimeout(() => { expired = true; reject(new Error('CACHE_TIMEOUT')); }, 2000);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (expired) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => { clearTimeout(timeout); reject(request.error); };
    // A concurrent upgrade may unblock as the other connection closes.
  });
}

/** Large image payloads persist across app restarts without filling localStorage. */
export async function loadPeriodDayMessages(
  day = getTodayLocal(),
  locale: AppLocale = getAppLocale(),
): Promise<Partial<Record<PeriodId, PeriodDayEntry>>> {
  const result: Partial<Record<PeriodId, PeriodDayEntry>> = {};
  const migrate = new Set<PeriodId>();
  for (const id of PERIOD_IDS) {
    for (const read of [
      () => sessionStorage.getItem(sessionKey(id, locale)),
      () => localStorage.getItem(persistentKey(id, locale)),
    ]) {
      try {
        const parsed: unknown = JSON.parse(read() ?? 'null');
        if (isEntry(parsed, id, day, locale) && (!result[id] || revision(parsed) >= revision(result[id]!))) {
          result[id] = parsed;
          migrate.add(id);
        }
      } catch { /* Storage may be unavailable. */ }
    }
  }

  let db: IDBDatabase | undefined;
  try {
    db = await openCache();
    const entries = await new Promise<unknown[]>((resolve, reject) => {
      const request = db!.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    for (const entry of entries) {
      for (const id of PERIOD_IDS) {
        if (isEntry(entry, id, day, locale) && (!result[id] || revision(entry) >= revision(result[id]!))) {
          result[id] = entry;
          migrate.delete(id);
        }
      }
    }
  } catch { /* Use the storage fallback and session memory. */ }
  finally { db?.close(); }

  const localeCacheId = (period: PeriodId) => cacheId(period, locale);
  for (const id of PERIOD_IDS) {
    if (isEntry(memoryCache[localeCacheId(id)], id, day, locale) && (!result[id] || revision(memoryCache[localeCacheId(id)]!) >= revision(result[id]!))) result[id] = memoryCache[localeCacheId(id)];
    if (result[id]) memoryCache[localeCacheId(id)] = result[id];
    if (migrate.has(id) && result[id]) await savePeriodDayMessage(id, day, result[id]!.message, locale);
  }
  return result;
}

export async function savePeriodDayMessage(
  periodId: PeriodId,
  day: string,
  message: DailyMessage,
  locale: AppLocale = getAppLocale(),
): Promise<void> {
  const id = cacheId(periodId, locale);
  const key = storageKey(periodId, locale);
  const entry = { day, message, locale, updatedAt: Math.max(Date.now(), (memoryCache[id]?.updatedAt ?? 0) + 1) };
  if (!isEntry(entry, periodId, day, locale)) return;
  memoryCache[id] = entry;
  let db: IDBDatabase | undefined;
  try {
    db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const transaction = db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const existing = store.get(key);
      existing.onsuccess = () => {
        // Slow opens must not let an initial greeting overwrite a newer manual
        // choice that was committed by another connection in the meantime.
        const saved = existing.result as PeriodDayEntry | undefined;
        if (!saved || revision(saved) <= entry.updatedAt) store.put(entry, key);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    try {
      const fallback = JSON.parse(localStorage.getItem(persistentKey(periodId, locale)) ?? 'null');
      if (fallback && (fallback.day !== day || revision(fallback) <= entry.updatedAt)) {
        localStorage.removeItem(persistentKey(periodId, locale));
      }
    } catch { /* Optional storage housekeeping. */ }
  } catch {
    try {
      localStorage.setItem(persistentKey(periodId, locale), JSON.stringify(entry));
    } catch { /* Keep the in-memory result when storage is full or disabled. */ }
  } finally { db?.close(); }
}
