import type { PeriodId } from '../types/period';
import { OFFLINE_DAILY_IMAGES } from './offlineDailyContent';
import { OFFLINE_MESSAGES_BY_LOCALE } from '../constants/offlineMessages';
import { getAppLocale, type AppLocale } from './locale';

export interface BankSelection {
  imageId: string;
  image: string;
  source: 'offline' | 'firebase';
}

export interface BankSelectionOptions {
  excludeImage?: string;
  rng?: () => number;
}

export interface BankMessageOptions {
  excludeText?: string;
  rng?: () => number;
  locale?: AppLocale;
}

export const PERSONAL_BANK_DB_NAME = 'bdq_personal_image_bank.v1';

const DB_VERSION = 2;
const IMAGE_STORE = 'images';
const HISTORY_STORE = 'image-history';
const STATE_STORE = 'state';
const FALLBACK_KEY = 'bdq_personal_bank_metadata_v1';
const PERIOD_IDS: readonly PeriodId[] = ['morning', 'afternoon', 'night'];
const OPEN_TIMEOUT_MS = 450;
const TRANSACTION_TIMEOUT_MS = 2_000;
// Keep a complete bundled rotation even when IndexedDB is unavailable and the
// user alternates between all three periods. Leave room for recent AI events.
const MAX_FALLBACK_IMAGE_EVENTS = Math.max(
  128,
  Object.values(OFFLINE_DAILY_IMAGES).reduce((total, images) => total + images.length, 0) * 2,
);
const MAX_MESSAGE_HISTORY = 128;

interface StoredImage {
  imageId: string;
  image: string;
  source: 'firebase';
  checksum: string;
  periods: PeriodId[];
  addedAt: number;
}

interface ImageCandidate {
  imageId: string;
  image?: string;
  source: 'offline' | 'firebase';
}

interface ImageUsage {
  imageId: string;
  globalLastUsedSequence: number;
  lastUsedPeriod: PeriodId;
  lastUsedDay: string;
}

interface ImageUseEvent {
  imageId: string;
  sequence: number;
  period: PeriodId;
  day: string;
}

interface MessageUseEvent {
  key: string;
  sequence: number;
  day: string;
  locale: AppLocale;
}

interface FallbackMetadata {
  version: 1;
  sequence: number;
  imageHistory: ImageUseEvent[];
  messageHistory: Record<PeriodId, MessageUseEvent[]>;
}

let memoryMetadata = emptyMetadata();

function emptyMetadata(): FallbackMetadata {
  return {
    version: 1,
    sequence: 0,
    imageHistory: [],
    messageHistory: { morning: [], afternoon: [], night: [] },
  };
}

function assertPeriod(period: PeriodId): void {
  if (!PERIOD_IDS.includes(period)) throw new RangeError('Período inválido para o banco pessoal.');
}

function assertDay(day: string): void {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new RangeError('A data deve usar o formato YYYY-MM-DD.');
  }
  const [year, month, date] = day.split('-').map(Number);
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, date);
  parsed.setUTCHours(0, 0, 0, 0);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== date) {
    throw new RangeError('Data inválida para o banco pessoal.');
  }
}

function openBank(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível.'));
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(PERSONAL_BANK_DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(new Error('O banco pessoal demorou para abrir.'));
    }, OPEN_TIMEOUT_MS);

    request.onupgradeneeded = () => {
      const db = request.result;
      const images = db.objectStoreNames.contains(IMAGE_STORE)
        ? request.transaction!.objectStore(IMAGE_STORE)
        : db.createObjectStore(IMAGE_STORE, { keyPath: 'imageId' });
      if (!images.indexNames.contains('periods')) images.createIndex('periods', 'periods', { multiEntry: true });
      if (!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE);
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
    };
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (settled) request.result.close();
      else {
        settled = true;
        resolve(request.result);
      }
    };
    request.onerror = () => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(request.error ?? new Error('Não foi possível abrir o banco pessoal.'));
      }
    };
  });
}

function normalizedMetadata(value: unknown): FallbackMetadata {
  const result = emptyMetadata();
  if (!value || typeof value !== 'object') return result;
  const parsed = value as Partial<FallbackMetadata>;
  if (parsed.version !== 1) return result;
  result.sequence = Number.isSafeInteger(parsed.sequence) && parsed.sequence! >= 0 ? parsed.sequence! : 0;
  if (Array.isArray(parsed.imageHistory)) {
    result.imageHistory = parsed.imageHistory.filter(isImageUseEvent).slice(-MAX_FALLBACK_IMAGE_EVENTS);
  }
  for (const period of PERIOD_IDS) {
    const events = parsed.messageHistory?.[period];
    if (Array.isArray(events)) result.messageHistory[period] = events
      .map(normalizeMessageUseEvent)
      .filter((event): event is MessageUseEvent => event !== null)
      .slice(-MAX_MESSAGE_HISTORY * 2);
  }
  return result;
}

function isImageUseEvent(value: unknown): value is ImageUseEvent {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ImageUseEvent>;
  return typeof item.imageId === 'string' && Number.isSafeInteger(item.sequence) &&
    typeof item.day === 'string' && PERIOD_IDS.includes(item.period as PeriodId);
}

function isMessageUseEvent(value: unknown): value is MessageUseEvent {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<MessageUseEvent>;
  return typeof item.key === 'string' && Number.isSafeInteger(item.sequence) && typeof item.day === 'string' &&
    (item.locale === undefined || item.locale === 'pt' || item.locale === 'en');
}

function normalizeMessageUseEvent(value: unknown): MessageUseEvent | null {
  if (!isMessageUseEvent(value)) return null;
  // Existing persisted history predates locale support and belongs to Portuguese.
  return { ...value, locale: value.locale ?? 'pt' };
}

function readFallbackMetadata(): FallbackMetadata {
  let persisted: FallbackMetadata | undefined;
  try {
    persisted = normalizedMetadata(JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? 'null'));
  } catch { /* Storage may be unavailable. */ }

  const merged = emptyMetadata();
  const source = [memoryMetadata, ...(persisted ? [persisted] : [])];
  merged.sequence = Math.max(...source.map((item) => item.sequence));
  merged.imageHistory = mergeEvents(source.flatMap((item) => item.imageHistory), (event) => `${event.sequence}:${event.imageId}`)
    .slice(-MAX_FALLBACK_IMAGE_EVENTS);
  for (const period of PERIOD_IDS) {
    merged.messageHistory[period] = mergeEvents(
      source.flatMap((item) => item.messageHistory[period]
        .map(normalizeMessageUseEvent)
        .filter((event): event is MessageUseEvent => event !== null)),
      (event) => `${event.sequence}:${event.locale}:${event.key}`,
    ).slice(-MAX_MESSAGE_HISTORY * 2);
  }
  return merged;
}

function mergeEvents<T extends { sequence: number }>(events: T[], keyOf: (event: T) => string): T[] {
  const unique = new Map<string, T>();
  for (const event of events) unique.set(keyOf(event), event);
  return [...unique.values()].sort((left, right) => left.sequence - right.sequence);
}

function persistFallbackMetadata(metadata: FallbackMetadata): void {
  memoryMetadata = normalizedMetadata(metadata);
  try {
    // This contains only bounded IDs and dates. Image data URLs stay in IndexedDB.
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(memoryMetadata));
  } catch { /* IndexedDB and memory remain the primary stores. */ }
}

function createBundledCandidates(period: PeriodId): ImageCandidate[] {
  const unique = new Map<string, ImageCandidate>();
  for (const image of OFFLINE_DAILY_IMAGES[period] ?? []) {
    if (typeof image?.src !== 'string' || !image.src) continue;
    const selection = { imageId: `offline:${image.src}`, image: image.src, source: 'offline' as const };
    unique.set(selection.imageId, selection);
  }
  return [...unique.values()];
}

function validStoredImageMetadata(value: unknown): value is Pick<StoredImage, 'imageId' | 'source' | 'checksum' | 'periods'> {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<StoredImage>;
  return typeof item.imageId === 'string' &&
    item.source === 'firebase' && typeof item.checksum === 'string' && Array.isArray(item.periods) &&
    item.periods.some((period) => PERIOD_IDS.includes(period));
}

function validStoredImage(value: unknown): value is StoredImage {
  return validStoredImageMetadata(value) && typeof (value as StoredImage).image === 'string';
}

function candidatesForPeriod(period: PeriodId, stored: ImageCandidate[]): ImageCandidate[] {
  const candidates = new Map(createBundledCandidates(period).map((item) => [item.imageId, item]));
  for (const item of stored) candidates.set(item.imageId, item);
  return [...candidates.values()];
}

function randomIndex(length: number, rng: () => number): number {
  const sample = rng();
  if (!Number.isFinite(sample)) throw new RangeError('O gerador aleatório retornou um valor inválido.');
  return Math.min(length - 1, Math.max(0, Math.floor(sample * length)));
}

function chooseRandom<T>(items: readonly T[], rng: () => number): T {
  if (items.length === 0) throw new Error('Não há opções para selecionar.');
  return items[randomIndex(items.length, rng)];
}

function chooseImage(
  candidates: ImageCandidate[],
  usage: Map<string, number>,
  options: BankSelectionOptions,
): ImageCandidate {
  if (candidates.length === 0) throw new Error('Nenhuma imagem está disponível neste período.');
  const rng = options.rng ?? Math.random;
  const excludingRequested = candidates.filter((item) =>
    options.excludeImage === undefined || (item.imageId !== options.excludeImage && item.image !== options.excludeImage));
  let available = excludingRequested.length > 0 ? excludingRequested : candidates;

  // Always avoid the most recently used candidate when a second option exists.
  if (available.length > 1) {
    let mostRecent: ImageCandidate | undefined;
    let mostRecentSequence = -1;
    for (const item of available) {
      const sequence = usage.get(item.imageId) ?? 0;
      if (sequence > mostRecentSequence) {
        mostRecent = item;
        mostRecentSequence = sequence;
      }
    }
    if (mostRecent && mostRecentSequence > 0) available = available.filter((item) => item.imageId !== mostRecent!.imageId);
  }

  const neverUsed = available.filter((item) => !usage.has(item.imageId));
  if (neverUsed.length > 0) return chooseRandom(neverUsed, rng);

  let oldestSequence = Infinity;
  for (const item of available) oldestSequence = Math.min(oldestSequence, usage.get(item.imageId) ?? 0);
  const leastRecent = available.filter((item) => (usage.get(item.imageId) ?? 0) === oldestSequence);
  return chooseRandom(leastRecent, rng);
}

function applyImageEvents(usage: Map<string, number>, events: ImageUseEvent[]): void {
  for (const event of events) usage.set(event.imageId, Math.max(usage.get(event.imageId) ?? 0, event.sequence));
}

function markSelectionInMemory(selection: BankSelection, period: PeriodId, day: string, sequence: number): void {
  const metadata = readFallbackMetadata();
  metadata.sequence = Math.max(metadata.sequence, sequence);
  metadata.imageHistory.push({ imageId: selection.imageId, sequence, period, day });
  metadata.imageHistory = metadata.imageHistory.slice(-MAX_FALLBACK_IMAGE_EVENTS);
  persistFallbackMetadata(metadata);
}

function selectAndMarkImageInDatabase(period: PeriodId, day: string, options: BankSelectionOptions): Promise<BankSelection> {
  return openBank().then((db) => new Promise<BankSelection>((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction([IMAGE_STORE, HISTORY_STORE, STATE_STORE], 'readwrite');
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    let settled = false;
    let chosen: BankSelection | undefined;
    let chosenSequence = 0;
    let choiceStarted = false;
    let imageCandidates: ImageCandidate[] | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      db.close();
      reject(error instanceof Error ? error : new Error('Não foi possível ler o banco pessoal.'));
    };
    timer = setTimeout(() => {
      try { transaction.abort(); } catch { /* The transaction may already be complete. */ }
      fail(new Error('A leitura do banco pessoal expirou.'));
    }, TRANSACTION_TIMEOUT_MS);

    const imageStore = transaction.objectStore(IMAGE_STORE);
    const historyStore = transaction.objectStore(HISTORY_STORE);
    const stateStore = transaction.objectStore(STATE_STORE);
    const cursorRequest = imageStore.index('periods').openKeyCursor(period);
    const historyRequest = historyStore.getAll();
    const sequenceRequest = stateStore.get('sequence');
    const storedCandidates: ImageCandidate[] = [];
    let history: unknown[] | undefined;
    let savedSequence: unknown;
    const persistChosenImage = () => {
      if (!chosen || !chosen.image) {
        try { transaction.abort(); } catch { /* The transaction may already be complete. */ }
        fail(new Error('A imagem selecionada não está disponível no banco pessoal.'));
        return;
      }
      try {
        historyStore.put({
          imageId: chosen.imageId,
          globalLastUsedSequence: chosenSequence,
          lastUsedPeriod: period,
          lastUsedDay: day,
        } satisfies ImageUsage, chosen.imageId);
        stateStore.put(chosenSequence, 'sequence');
      } catch (error) {
        try { transaction.abort(); } catch { /* The transaction may already be complete. */ }
        fail(error);
      }
    };
    const maybeChoose = () => {
      if (!imageCandidates || !history || sequenceRequest.readyState !== 'done' || choiceStarted) return;
      choiceStarted = true;
      try {
        const metadata = readFallbackMetadata();
        const usage = new Map<string, number>();
        for (const value of history) {
          if (!value || typeof value !== 'object') continue;
          const item = value as Partial<ImageUsage>;
          if (typeof item.imageId === 'string' && Number.isSafeInteger(item.globalLastUsedSequence)) {
            usage.set(item.imageId, item.globalLastUsedSequence!);
          }
        }
        applyImageEvents(usage, metadata.imageHistory);
        const candidates = candidatesForPeriod(period, imageCandidates);
        const candidate = chooseImage(candidates, usage, options);
        const baseSequence = Math.max(
          Number.isSafeInteger(savedSequence) && (savedSequence as number) >= 0 ? savedSequence as number : 0,
          metadata.sequence,
          ...[...usage.values()],
        );
        chosenSequence = baseSequence + 1;
        if (candidate.source === 'offline') {
          chosen = { imageId: candidate.imageId, image: candidate.image ?? '', source: 'offline' };
          persistChosenImage();
        } else {
          const selectedImageRequest = imageStore.get(candidate.imageId);
          selectedImageRequest.onsuccess = () => {
            const storedImage = selectedImageRequest.result;
            if (!validStoredImage(storedImage) || !storedImage.periods.includes(period)) {
              try { transaction.abort(); } catch { /* The transaction may already be complete. */ }
              fail(new Error('A imagem selecionada não pôde ser recuperada.'));
              return;
            }
            chosen = { imageId: candidate.imageId, image: storedImage.image, source: 'firebase' };
            persistChosenImage();
          };
          selectedImageRequest.onerror = () => fail(transaction.error ?? new Error('Falha ao recuperar a imagem selecionada.'));
        }
      } catch (error) {
        try { transaction.abort(); } catch { /* The transaction may already be complete. */ }
        fail(error);
      }
    };
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        imageCandidates = storedCandidates;
        maybeChoose();
        return;
      }
      if (typeof cursor.primaryKey === 'string') storedCandidates.push({ imageId: cursor.primaryKey, source: 'firebase' });
      cursor.continue();
    };
    cursorRequest.onerror = () => fail(transaction.error ?? new Error('Falha ao percorrer imagens do banco pessoal.'));
    historyRequest.onsuccess = () => { history = historyRequest.result; maybeChoose(); };
    sequenceRequest.onsuccess = () => { savedSequence = sequenceRequest.result; maybeChoose(); };
    historyRequest.onerror = sequenceRequest.onerror = () => fail(transaction.error ?? new Error('Falha ao ler o banco pessoal.'));
    transaction.oncomplete = () => {
      if (settled) return;
      if (!chosen) { fail(new Error('Nenhuma imagem foi selecionada.')); return; }
      settled = true;
      clearTimeout(timer);
      db.close();
      markSelectionInMemory(chosen, period, day, chosenSequence);
      resolve(chosen);
    };
    transaction.onerror = transaction.onabort = () => fail(transaction.error ?? new Error('Falha ao salvar o histórico de imagens.'));
  }));
}

function fallbackSelectImage(period: PeriodId, day: string, options: BankSelectionOptions): BankSelection {
  const metadata = readFallbackMetadata();
  const usage = new Map<string, number>();
  applyImageEvents(usage, metadata.imageHistory);
  const candidates = createBundledCandidates(period);
  const candidate = chooseImage(candidates, usage, options);
  const chosen: BankSelection = { imageId: candidate.imageId, image: candidate.image ?? '', source: candidate.source };
  const sequence = Math.max(metadata.sequence, ...[...usage.values()], 0) + 1;
  markSelectionInMemory(chosen, period, day, sequence);
  return chosen;
}

/** Select and record a photo. Persisted generated photos join only their compatible period. */
export async function selectBankImage(
  period: PeriodId,
  day: string,
  options: BankSelectionOptions = {},
): Promise<BankSelection> {
  assertPeriod(period);
  assertDay(day);
  let resolvedOptions = options;
  if (options.excludeImage?.startsWith('data:image/')) {
    try {
      const excludedChecksum = await checksum(parseImageDataUrl(options.excludeImage));
      resolvedOptions = { ...options, excludeImage: `firebase:checksum:${excludedChecksum}` };
    } catch { /* Non-bank image URLs are compared directly when available. */ }
  }
  try {
    return await selectAndMarkImageInDatabase(period, day, resolvedOptions);
  } catch {
    // The bundled images keep the offline flow available if IndexedDB is blocked or unavailable.
    return fallbackSelectImage(period, day, resolvedOptions);
  }
}

export class BankImageStorageError extends Error {
  readonly causeValue: unknown;

  constructor(cause: unknown) {
    super('A imagem gerada não foi salva no banco pessoal. Verifique o espaço disponível e tente novamente.');
    this.name = 'BankImageStorageError';
    this.causeValue = cause;
  }
}

function parseImageDataUrl(image: string): Uint8Array {
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(image);
  if (!match || match[2].length % 4 !== 0) {
    throw new TypeError('A imagem gerada deve ser um data URL JPEG ou PNG válido.');
  }
  let binary: string;
  try { binary = atob(match[2]); }
  catch { throw new TypeError('A imagem gerada contém dados Base64 inválidos.'); }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (bytes.length === 0) throw new TypeError('A imagem gerada está vazia.');
  return bytes;
}

function fallbackChecksum(bytes: Uint8Array): string {
  // Deterministic 64-bit FNV-1a fallback for runtimes without Web Crypto.
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * prime) & mask;
  return hash.toString(16).padStart(16, '0');
}

async function checksum(bytes: Uint8Array): Promise<string> {
  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return fallbackChecksum(bytes);
  }
}

function saveGeneratedAndMark(
  period: PeriodId,
  day: string,
  image: string,
  imageId: string,
  checksumValue: string,
): Promise<BankSelection> {
  return openBank().then((db) => new Promise<BankSelection>((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction([IMAGE_STORE, HISTORY_STORE, STATE_STORE], 'readwrite');
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    let stored: StoredImage | undefined;
    let nextSequence = 0;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      db.close();
      reject(error instanceof Error ? error : new Error('Falha ao salvar imagem.'));
    };
    timer = setTimeout(() => {
      try { transaction.abort(); } catch { /* The transaction may already be complete. */ }
      fail(new Error('A gravação do banco pessoal expirou.'));
    }, TRANSACTION_TIMEOUT_MS);

    const imageStore = transaction.objectStore(IMAGE_STORE);
    const historyStore = transaction.objectStore(HISTORY_STORE);
    const stateStore = transaction.objectStore(STATE_STORE);
    const existingRequest = imageStore.get(imageId);
    const historyRequest = historyStore.get(imageId);
    const sequenceRequest = stateStore.get('sequence');
    let existing: unknown;
    let history: unknown;
    let savedSequence: unknown;
    const maybeWrite = () => {
      if (existingRequest.readyState !== 'done' || historyRequest.readyState !== 'done' || sequenceRequest.readyState !== 'done') return;
      try {
        const metadata = readFallbackMetadata();
        const prior = validStoredImage(existing) ? existing : undefined;
        const periods = new Set<PeriodId>(prior?.periods ?? []);
        periods.add(period);
        stored = {
          imageId,
          image: prior?.image ?? image,
          source: 'firebase',
          checksum: checksumValue,
          periods: [...periods],
          addedAt: prior?.addedAt ?? Date.now(),
        };
        const priorUse = history && typeof history === 'object' ? (history as Partial<ImageUsage>).globalLastUsedSequence ?? 0 : 0;
        nextSequence = Math.max(
          Number.isSafeInteger(savedSequence) && (savedSequence as number) >= 0 ? savedSequence as number : 0,
          metadata.sequence,
          Number.isSafeInteger(priorUse) ? priorUse : 0,
          0,
        ) + 1;
        imageStore.put(stored);
        historyStore.put({ imageId, globalLastUsedSequence: nextSequence, lastUsedPeriod: period, lastUsedDay: day } satisfies ImageUsage, imageId);
        stateStore.put(nextSequence, 'sequence');
      } catch (error) {
        try { transaction.abort(); } catch { /* The transaction may already be complete. */ }
        fail(error);
      }
    };
    existingRequest.onsuccess = () => { existing = existingRequest.result; maybeWrite(); };
    historyRequest.onsuccess = () => { history = historyRequest.result; maybeWrite(); };
    sequenceRequest.onsuccess = () => { savedSequence = sequenceRequest.result; maybeWrite(); };
    existingRequest.onerror = historyRequest.onerror = sequenceRequest.onerror = () => fail(transaction.error ?? new Error('Falha ao consultar a imagem.'));
    transaction.oncomplete = () => {
      if (settled) return;
      if (!stored) { fail(new Error('A imagem não foi confirmada no banco pessoal.')); return; }
      settled = true;
      clearTimeout(timer);
      db.close();
      const selection: BankSelection = { imageId, image: stored.image, source: 'firebase' };
      markSelectionInMemory(selection, period, day, nextSequence);
      resolve(selection);
    };
    transaction.onerror = transaction.onabort = () => fail(transaction.error ?? new Error('Falha ao confirmar a imagem.'));
  }));
}

/** Save an AI image explicitly; personal photos are never added by selection. */
export async function addGeneratedBankImage(period: PeriodId, imageDataUrl: string, day: string): Promise<BankSelection> {
  assertPeriod(period);
  assertDay(day);
  const bytes = parseImageDataUrl(imageDataUrl);
  try {
    const checksumValue = await checksum(bytes);
    const imageId = `firebase:checksum:${checksumValue}`;
    return await saveGeneratedAndMark(period, day, imageDataUrl, imageId, checksumValue);
  } catch (error) {
    throw new BankImageStorageError(error);
  }
}

function stableTextKey(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return `text-${fallbackChecksum(bytes)}`;
}

function uniqueMessages(period: PeriodId, locale: AppLocale): string[] {
  const messages: readonly string[] = OFFLINE_MESSAGES_BY_LOCALE[locale][period];
  return [...new Set(messages.filter((message) => message.trim().length > 0))];
}

function chooseMessage(period: PeriodId, messages: string[], history: MessageUseEvent[], options: BankMessageOptions): string {
  if (messages.length === 0) throw new Error('Não há mensagens offline neste período.');
  const rng = options.rng ?? Math.random;
  const requested = messages.filter((message) => message !== options.excludeText);
  let available = requested.length > 0 ? requested : messages;
  const latestKeys = new Set(history.map((event) => event.key));
  const neverUsed = available.filter((message) => !latestKeys.has(stableTextKey(message)));
  if (neverUsed.length > 0) return chooseRandom(neverUsed, rng);

  const sequenceByKey = new Map<string, number>();
  for (const event of history) sequenceByKey.set(event.key, Math.max(sequenceByKey.get(event.key) ?? 0, event.sequence));
  let oldestSequence = Infinity;
  for (const message of available) oldestSequence = Math.min(oldestSequence, sequenceByKey.get(stableTextKey(message)) ?? 0);
  available = available.filter((message) => (sequenceByKey.get(stableTextKey(message)) ?? 0) === oldestSequence);
  return chooseRandom(available, rng);
}

function selectAndMarkMessageInDatabase(period: PeriodId, day: string, locale: AppLocale, options: BankMessageOptions): Promise<string> {
  return openBank().then((db) => new Promise<string>((resolve, reject) => {
    let transaction: IDBTransaction;
    try { transaction = db.transaction(STATE_STORE, 'readwrite'); }
    catch (error) { db.close(); reject(error); return; }
    let settled = false;
    let selected: string | undefined;
    let nextSequence = 0;
    let timer: ReturnType<typeof setTimeout>;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      db.close();
      reject(error instanceof Error ? error : new Error('Falha ao selecionar mensagem.'));
    };
    timer = setTimeout(() => {
      try { transaction.abort(); } catch { /* The transaction may already be complete. */ }
      fail(new Error('A seleção da mensagem expirou.'));
    }, TRANSACTION_TIMEOUT_MS);

    const store = transaction.objectStore(STATE_STORE);
    const historyRequest = store.get(`messages:${locale}:${period}`);
    const legacyHistoryRequest = locale === 'pt' ? store.get(`messages:${period}`) : undefined;
    const historyRequests = legacyHistoryRequest ? [historyRequest, legacyHistoryRequest] : [historyRequest];
    const sequenceRequest = store.get('sequence');
    let savedSequence: unknown;
    const maybeChoose = () => {
      if (historyRequests.some((request) => request.readyState !== 'done') || sequenceRequest.readyState !== 'done') return;
      try {
        const metadata = readFallbackMetadata();
        const storedHistory = historyRequests.flatMap((request) => Array.isArray(request.result)
          ? request.result.map(normalizeMessageUseEvent).filter((event): event is MessageUseEvent => event !== null)
          : []);
        const localHistory = metadata.messageHistory[period].filter((event) => event.locale === locale);
        const history = mergeEvents(
          [...storedHistory.filter((event) => event.locale === locale), ...localHistory],
          (event) => `${event.sequence}:${event.locale}:${event.key}`,
        );
        selected = chooseMessage(period, uniqueMessages(period, locale), history, options);
        nextSequence = Math.max(
          Number.isSafeInteger(savedSequence) && (savedSequence as number) >= 0 ? savedSequence as number : 0,
          metadata.sequence,
          ...history.map((event) => event.sequence),
          0,
        ) + 1;
        const nextHistory = [...history, { key: stableTextKey(selected), sequence: nextSequence, day, locale }].slice(-MAX_MESSAGE_HISTORY);
        store.put(nextHistory, `messages:${locale}:${period}`);
        store.put(nextSequence, 'sequence');
      } catch (error) {
        try { transaction.abort(); } catch { /* The transaction may already be complete. */ }
        fail(error);
      }
    };
    historyRequests.forEach((request) => { request.onsuccess = maybeChoose; });
    sequenceRequest.onsuccess = () => { savedSequence = sequenceRequest.result; maybeChoose(); };
    historyRequests.forEach((request) => { request.onerror = () => fail(transaction.error ?? new Error('Falha ao ler histórico de mensagens.')); });
    sequenceRequest.onerror = () => fail(transaction.error ?? new Error('Falha ao ler histórico de mensagens.'));
    transaction.oncomplete = () => {
      if (settled) return;
      if (!selected) { fail(new Error('Nenhuma mensagem foi selecionada.')); return; }
      settled = true;
      clearTimeout(timer);
      db.close();
      markMessageInMemory(period, selected, day, nextSequence, locale);
      resolve(selected);
    };
    transaction.onerror = transaction.onabort = () => fail(transaction.error ?? new Error('Falha ao salvar histórico de mensagens.'));
  }));
}

function markMessageInMemory(period: PeriodId, message: string, day: string, sequence: number, locale: AppLocale): void {
  const metadata = readFallbackMetadata();
  metadata.sequence = Math.max(metadata.sequence, sequence);
  metadata.messageHistory[period].push({ key: stableTextKey(message), sequence, day, locale });
  const currentLocaleHistory = metadata.messageHistory[period].filter((event) => event.locale === locale).slice(-MAX_MESSAGE_HISTORY);
  const otherLocaleHistory = metadata.messageHistory[period].filter((event) => event.locale !== locale);
  metadata.messageHistory[period] = [...otherLocaleHistory, ...currentLocaleHistory].slice(-MAX_MESSAGE_HISTORY * 2);
  persistFallbackMetadata(metadata);
}

function fallbackSelectMessage(period: PeriodId, day: string, locale: AppLocale, options: BankMessageOptions): string {
  const metadata = readFallbackMetadata();
  const history = metadata.messageHistory[period].filter((event) => event.locale === locale);
  const selected = chooseMessage(period, uniqueMessages(period, locale), history, options);
  const sequence = Math.max(metadata.sequence, ...history.map((event) => event.sequence), 0) + 1;
  markMessageInMemory(period, selected, day, sequence, locale);
  return selected;
}

/** Select a bundled message without repeating until the period's available pool is exhausted. */
export async function selectBankMessage(
  period: PeriodId,
  day: string,
  options: BankMessageOptions = {},
): Promise<string> {
  assertPeriod(period);
  assertDay(day);
  const locale = options.locale ?? getAppLocale();
  try {
    return await selectAndMarkMessageInDatabase(period, day, locale, options);
  } catch {
    return fallbackSelectMessage(period, day, locale, options);
  }
}
