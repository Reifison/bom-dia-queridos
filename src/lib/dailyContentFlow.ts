import type { MessageCollection } from '../constants/messageCollections';
import type { DailyMessage, PeriodId } from '../types/period';
import type { BankSelection } from './personalImageBank';
import type { DailyQuota } from './dailyGeneration';

export type ContentBusyPhase = 'ad' | 'bank' | 'ai' | 'photo' | null;
export type ContentActionResult = 'updated' | 'cancelled' | 'busy' | 'failed';

const AI_FAILURE_MESSAGES: Record<string, string> = {
  FIREBASE_AI_APPCHECK_FAILED: 'Não foi possível validar a segurança do app. Tente novamente.',
  FIREBASE_AI_NETWORK_ERROR: 'Não foi possível conectar ao serviço de imagens. Verifique sua conexão.',
  FIREBASE_AI_OFFLINE: 'Conecte-se à internet para gerar uma imagem.',
  FIREBASE_AI_TIMEOUT: 'A geração da imagem demorou mais que o esperado. Tente novamente.',
};

type ContentLogLevel = 'info' | 'warn';

function logContentFlow(event: string, fields: Record<string, string>, level: ContentLogLevel = 'info'): void {
  // Never pass errors, image data, prompts, identifiers, tokens, or URLs to logs.
  globalThis.console?.[level]?.('[daily-content]', { event, ...fields });
}

function safeErrorCode(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code : '';
  return /^(FIREBASE_AI|PERSONAL_PHOTO)_[A-Z_]+$/.test(code) && code.length <= 64 ? code : 'UNKNOWN';
}

function aiFailureMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code : '';
  const userMessage = error && typeof error === 'object' && 'userMessage' in error &&
    typeof error.userMessage === 'string' ? error.userMessage.trim() : '';
  if (code.startsWith('FIREBASE_AI_') && userMessage) return userMessage;
  return Object.hasOwn(AI_FAILURE_MESSAGES, code) ? AI_FAILURE_MESSAGES[code]
    : 'A criação da imagem está indisponível agora. Preparamos outra mensagem para você.';
}

export interface DailyContentFlowDependencies {
  currentDay(): string;
  isCurrent(period: PeriodId, day: string): boolean;
  readMessage(period: PeriodId, day: string): DailyMessage;
  writeMessage(message: DailyMessage, day: string): void;
  selectImage(period: PeriodId, day: string, excludeImage?: string, bundledOnly?: boolean): Promise<BankSelection>;
  selectText(period: PeriodId, day: string, excludeText?: string, image?: string): Promise<string>;
  selectCollection?(period: PeriodId, day: string, collection: MessageCollection, excludeText: string): Promise<DailyMessage>;
  generateAi(period: PeriodId): Promise<string>;
  prepareAi(image: string): Promise<string>;
  saveAi(period: PeriodId, image: string, day: string): Promise<BankSelection>;
  pickPhoto(): Promise<string | null>;
  aiAvailable(): boolean;
  readQuota(day: string): DailyQuota;
  writeQuota(quota: DailyQuota): void;
  beforeAction(isCurrent: () => boolean): Promise<void>;
  onBusy(phase: ContentBusyPhase): void;
  onError(message: string | null): void;
}

/**
 * A single synchronous lock covers the ad, picker and generation, including the
 * time before React renders disabled buttons. Navigation invalidates intent;
 * already produced AI images still get saved and charged to that request's day.
 */
export function createDailyContentFlow(deps: DailyContentFlowDependencies) {
  let busy = false;
  let revision = 0;
  const quotas = new Map<string, DailyQuota>();

  const quotaFor = (day: string): DailyQuota => {
    const stored = deps.readQuota(day);
    const memory = quotas.get(day);
    const quota: DailyQuota = { day, remaining: { ...stored.remaining } };
    if (memory) {
      for (const period of ['morning', 'afternoon', 'night'] as PeriodId[]) {
        quota.remaining[period] = Math.min(quota.remaining[period], memory.remaining[period]);
      }
    }
    quotas.set(day, quota);
    return quota;
  };
  const consumeAi = (period: PeriodId, day: string) => {
    const previous = quotaFor(day);
    const next = { day, remaining: { ...previous.remaining, [period]: 0 } };
    quotas.set(day, next);
    // An old request must never overwrite the next day's stored allowance.
    if (deps.currentDay() === day) deps.writeQuota(next);
  };

  const run = async (
    action: 'offline' | 'generate' | 'personal-photo',
    period: PeriodId,
    day: string,
    work: (isCurrent: () => boolean) => Promise<ContentActionResult>,
  ): Promise<ContentActionResult> => {
    if (busy) return 'busy';
    const ticket = revision;
    const isCurrent = () => ticket === revision && deps.currentDay() === day && deps.isCurrent(period, day);
    if (!isCurrent()) return 'cancelled';
    if (action === 'generate' && (!deps.aiAvailable() || quotaFor(day).remaining[period] <= 0)) return 'cancelled';
    busy = true;
    logContentFlow('action-started', { action, period });
    deps.onError(null);
    try {
      // Ad/network failure must not block the bank or the user's photo picker.
      deps.onBusy('ad');
      try { await deps.beforeAction(isCurrent); } catch { /* Continue without an ad. */ }
      if (!isCurrent()) return 'cancelled';
      const result = await work(isCurrent);
      logContentFlow('action-finished', { action, period, result });
      return result;
    } catch (error) {
      logContentFlow('action-failed', { action, period, code: safeErrorCode(error) }, 'warn');
      if (isCurrent()) {
        const message = error && typeof error === 'object' && 'userMessage' in error && typeof error.userMessage === 'string'
          ? error.userMessage : 'Não foi possível preparar a imagem. Sua mensagem continua disponível. Tente novamente.';
        deps.onError(message);
      }
      return 'failed';
    } finally {
      busy = false;
      deps.onBusy(null);
    }
  };

  const useBank = async (
    period: PeriodId,
    day: string,
    isCurrent: () => boolean,
    reason: 'scheduled' | 'ai-fallback',
  ): Promise<ContentActionResult> => {
    deps.onBusy('bank');
    logContentFlow('bank-started', { period, reason });
    const previous = deps.readMessage(period, day);
    let image: BankSelection;
    try {
      image = await deps.selectImage(period, day, previous.bankImageId ?? previous.image, true);
      logContentFlow('bank-image-selected', { period, source: image.source, reason });
    } catch (error) {
      logContentFlow('bank-failed', { period, stage: 'image-selection', code: safeErrorCode(error) }, 'warn');
      throw error;
    }
    if (!isCurrent()) return 'cancelled';
    let mainText: string;
    try {
      mainText = await deps.selectText(period, day, previous.mainText, image.image);
    } catch (error) {
      logContentFlow('bank-failed', { period, stage: 'text-selection', code: safeErrorCode(error) }, 'warn');
      throw error;
    }
    if (!isCurrent()) return 'cancelled';
    deps.writeMessage({
      periodId: period,
      image: image.image,
      bankImageId: image.imageId,
      source: image.source,
      mainText,
    }, day);
    logContentFlow('bank-completed', { period, source: image.source, reason });
    return 'updated';
  };

  return {
    invalidate() { revision += 1; },
    isBusy() { return busy; },
    remainingAi(period: PeriodId, day: string) { return quotaFor(day).remaining[period]; },

    anotherMessage(period: PeriodId, day: string, collection?: MessageCollection): Promise<ContentActionResult> {
      return run('offline', period, day, async (isCurrent) => {
        if (!collection || !deps.selectCollection) return useBank(period, day, isCurrent, 'scheduled');
        deps.onBusy('bank');
        const previous = deps.readMessage(period, day);
        const message = await deps.selectCollection(period, day, collection, previous.mainText);
        if (!isCurrent()) return 'cancelled';
        deps.writeMessage(message, day);
        return 'updated';
      });
    },

    createWithAi(period: PeriodId, day: string): Promise<ContentActionResult> {
      return run('generate', period, day, async (isCurrent) => {
        const previous = deps.readMessage(period, day);
        if (!deps.aiAvailable() || quotaFor(day).remaining[period] <= 0) return 'cancelled';

        logContentFlow('source-selected', { period, source: 'firebase-ai' });
        deps.onBusy('ai');
        logContentFlow('ai-request-started', { period });
        let generated: string;
        try {
          generated = await deps.generateAi(period);
        } catch (error) {
          if (!isCurrent()) return 'cancelled';
          const code = safeErrorCode(error);
          logContentFlow('ai-request-failed', { period, code }, 'warn');
          const result = await useBank(period, day, isCurrent, 'ai-fallback');
          if (isCurrent() && code !== 'FIREBASE_AI_QUOTA_EXCEEDED') deps.onError(aiFailureMessage(error));
          return result;
        }

        logContentFlow('ai-request-succeeded', { period });
        let image: string;
        try {
          image = await deps.prepareAi(generated);
        } catch (error) {
          if (!isCurrent()) return 'cancelled';
          logContentFlow('ai-image-preparation-failed', { period, code: safeErrorCode(error) }, 'warn');
          const result = await useBank(period, day, isCurrent, 'ai-fallback');
          if (isCurrent()) deps.onError(aiFailureMessage(error));
          return result;
        }
        consumeAi(period, day);
        logContentFlow('ai-image-prepared', { period });

        let saved: BankSelection | undefined;
        try {
          saved = await deps.saveAi(period, image, day);
          logContentFlow('ai-bank-save-succeeded', { period, source: saved.source });
        } catch {
          logContentFlow('ai-bank-save-failed', { period, reason: 'storage-unavailable' }, 'warn');
        }
        // Keep a paid, completed image in the personal bank even after Home or midnight.
        if (!isCurrent()) return 'cancelled';
        const mainText = await deps.selectText(period, day, previous.mainText);
        if (!isCurrent()) return 'cancelled';
        deps.writeMessage({
          periodId: period,
          image: saved?.image ?? image,
          bankImageId: saved?.imageId,
          source: 'firebase',
          mainText,
        }, day);
        logContentFlow('ai-card-updated', { period, banked: saved ? 'yes' : 'no' });
        if (!saved) deps.onError('A imagem está pronta, mas não foi possível guardá-la no seu banco. Confira o espaço disponível no aparelho.');
        return 'updated';
      });
    },

    usePersonalPhoto(period: PeriodId, day: string): Promise<ContentActionResult> {
      return run('personal-photo', period, day, async (isCurrent) => {
        deps.onBusy('photo');
        const image = await deps.pickPhoto();
        if (!image || !isCurrent()) return 'cancelled';
        // Personal photos belong only to this card, never to automatic rotation or AI.
        const previous = deps.readMessage(period, day);
        deps.writeMessage({ ...previous, image, source: 'personal', bankImageId: undefined, offline: undefined, textPosition: undefined }, day);
        return 'updated';
      });
    },
  };
}
