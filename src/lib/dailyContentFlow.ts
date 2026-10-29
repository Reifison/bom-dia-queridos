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
  FIREBASE_AI_QUOTA_EXCEEDED: 'O limite de gerações foi atingido. Tente novamente mais tarde.',
};

function aiFailureMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code : '';
  // Record only an allowlisted category, never raw errors, prompts, tokens or URLs.
  const safeCode = /^(FIREBASE_AI|PERSONAL_PHOTO)_[A-Z_]+$/.test(code) && code.length <= 64 ? code : 'UNKNOWN';
  globalThis.console?.warn('[image-generation]', { code: safeCode });
  return Object.hasOwn(AI_FAILURE_MESSAGES, code) ? AI_FAILURE_MESSAGES[code]
    : 'A criação da imagem está indisponível agora. Preparamos outra mensagem para você.';
}

export interface DailyContentFlowDependencies {
  currentDay(): string;
  isCurrent(period: PeriodId, day: string): boolean;
  readMessage(period: PeriodId, day: string): DailyMessage;
  writeMessage(message: DailyMessage, day: string): void;
  selectImage(period: PeriodId, day: string, excludeImage?: string): Promise<BankSelection>;
  selectText(period: PeriodId, day: string, excludeText?: string): Promise<string>;
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

function manualRefreshes(message: DailyMessage, day: string): number {
  const progress = message.generationFlow;
  return progress?.day === day && Number.isSafeInteger(progress.manualBankRefreshes) && progress.manualBankRefreshes >= 0
    ? progress.manualBankRefreshes : 0;
}

/** A persisted bank refresh must happen before the one daily AI creation. */
export function nextContentSource(message: DailyMessage, day: string, aiRemaining: number, aiAvailable: boolean): 'bank' | 'ai' {
  return manualRefreshes(message, day) > 0 && aiRemaining > 0 && aiAvailable ? 'ai' : 'bank';
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
    period: PeriodId,
    day: string,
    work: (isCurrent: () => boolean) => Promise<ContentActionResult>,
  ): Promise<ContentActionResult> => {
    if (busy) return 'busy';
    const ticket = revision;
    const isCurrent = () => ticket === revision && deps.currentDay() === day && deps.isCurrent(period, day);
    if (!isCurrent()) return 'cancelled';
    busy = true;
    deps.onError(null);
    deps.onBusy('ad');
    try {
      // Ad/network failure must not block the bank or the user's photo picker.
      try { await deps.beforeAction(isCurrent); } catch { /* Continue without an ad. */ }
      if (!isCurrent()) return 'cancelled';
      return await work(isCurrent);
    } catch (error) {
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

  const useBank = async (period: PeriodId, day: string, isCurrent: () => boolean): Promise<ContentActionResult> => {
    deps.onBusy('bank');
    const previous = deps.readMessage(period, day);
    const image = await deps.selectImage(period, day, previous.bankImageId ?? previous.image);
    if (!isCurrent()) return 'cancelled';
    const mainText = await deps.selectText(period, day, previous.mainText);
    if (!isCurrent()) return 'cancelled';
    deps.writeMessage({
      periodId: period,
      image: image.image,
      bankImageId: image.imageId,
      source: image.source,
      mainText,
      generationFlow: { day, manualBankRefreshes: Math.min(Number.MAX_SAFE_INTEGER, manualRefreshes(previous, day) + 1) },
    }, day);
    return 'updated';
  };

  return {
    invalidate() { revision += 1; },
    isBusy() { return busy; },
    remainingAi(period: PeriodId, day: string) { return quotaFor(day).remaining[period]; },

    generate(period: PeriodId, day: string): Promise<ContentActionResult> {
      return run(period, day, async (isCurrent) => {
        const previous = deps.readMessage(period, day);
        if (nextContentSource(previous, day, quotaFor(day).remaining[period], deps.aiAvailable()) === 'bank') {
          return useBank(period, day, isCurrent);
        }

        deps.onBusy('ai');
        let image: string;
        try {
          image = await deps.prepareAi(await deps.generateAi(period));
        } catch (error) {
          // No successful image was produced: retain the AI allowance and give
          // another local composition rather than stranding the user on an error.
          if (!isCurrent()) return 'cancelled';
          const result = await useBank(period, day, isCurrent);
          if (isCurrent()) deps.onError(aiFailureMessage(error));
          return result;
        }
        consumeAi(period, day);

        let saved: BankSelection | undefined;
        try { saved = await deps.saveAi(period, image, day); }
        catch { /* A usable image may still be shared even when storage is full. */ }
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
          generationFlow: { day, manualBankRefreshes: Math.max(1, manualRefreshes(previous, day)) },
        }, day);
        if (!saved) deps.onError('A imagem está pronta, mas não foi possível guardá-la no seu banco. Confira o espaço disponível no aparelho.');
        return 'updated';
      });
    },

    usePersonalPhoto(period: PeriodId, day: string): Promise<ContentActionResult> {
      return run(period, day, async (isCurrent) => {
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
