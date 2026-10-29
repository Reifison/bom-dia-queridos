import { isDailyMessage, type DailyMessage, type PeriodId } from '../types/period';
import { getAppLocale, type AppLocale } from './locale';

const STORAGE_KEY = 'bdq_daily_generation_quota.v1';
const INITIAL_REMAINING = { morning: 1, afternoon: 1, night: 1 };
export type DailyQuota = { day: string; remaining: Record<PeriodId, number> };

export function loadDailyQuota(day: string): DailyQuota {
  let remaining = { ...INITIAL_REMAINING };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (parsed?.day === day && parsed.remaining) {
      for (const period of Object.keys(remaining) as PeriodId[]) {
        const count = parsed.remaining[period];
        remaining[period] = Number.isInteger(count) && count >= 0 ? Math.min(1, count) : 1;
      }
    }
  } catch { /* Keep a usable session when storage is unavailable. */ }
  return { day, remaining };
}

export function saveDailyQuota(quota: DailyQuota): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(quota)); }
  catch { /* In-memory quota remains usable. */ }
}

/** Share pending automatic requests across repeated effects; failures remain retryable. */
export function createDailyMessageLoader(
  text: (period: PeriodId, locale: AppLocale) => Promise<{ mainText: string; quote?: string }>,
  image: (period: PeriodId) => Promise<string>,
  currentLocale: () => AppLocale = getAppLocale,
) {
  const pending = new Map<string, Promise<DailyMessage>>();
  const partial = new Map<string, { text?: { mainText: string; quote?: string }; image?: string }>();
  const keyFor = (period: PeriodId, day: string, locale: AppLocale) => `${locale}:${day}:${period}`;
  return {
    isPending: (period: PeriodId, day: string, locale = currentLocale()) => pending.has(keyFor(period, day, locale)),
    load(period: PeriodId, day: string, locale = currentLocale()): Promise<DailyMessage> {
      const key = keyFor(period, day, locale);
      const existing = pending.get(key);
      if (existing) return existing;
      for (const previous of partial.keys()) {
        if (previous.split(':')[1] !== day) partial.delete(previous);
      }
      const saved = partial.get(key) ?? {};
      partial.set(key, saved);
      const request = Promise.allSettled([
        saved.text ? Promise.resolve(saved.text) : text(period, locale),
        saved.image ? Promise.resolve(saved.image) : image(period),
      ])
        .then(([textResult, imageResult]) => {
          if (textResult.status === 'fulfilled') saved.text = textResult.value;
          if (imageResult.status === 'fulfilled') saved.image = imageResult.value;
          if (textResult.status === 'rejected') throw textResult.reason;
          if (imageResult.status === 'rejected') throw imageResult.reason;
          const message = { ...textResult.value, periodId: period, image: imageResult.value };
          if (!isDailyMessage(message)) {
            partial.delete(key);
            throw new Error('INVALID_GENERATION_RESPONSE');
          }
          partial.delete(key);
          return message;
        })
        .finally(() => { if (pending.get(key) === request) pending.delete(key); });
      pending.set(key, request);
      return request;
    },
  };
}

export function generationErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'RATE_LIMITED') return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
  if (code === 'QUOTA_EXCEEDED') return 'A geração está temporariamente indisponível. Tente novamente mais tarde.';
  if (code === 'GENERATION_TIMEOUT' || (error instanceof Error && error.name === 'TimeoutError')) return 'A geração demorou mais que o esperado. Tente novamente.';
  if (['SERVICE_NOT_CONFIGURED', 'PROVIDER_AUTH_FAILED', 'MODEL_UNAVAILABLE', 'MISSING_VITE_API_ORIGIN'].includes(code)) {
    return 'O serviço de imagens está indisponível no momento. Tente novamente mais tarde.';
  }
  return 'Não foi possível atualizar a mensagem de hoje. Verifique sua conexão e tente novamente.';
}
