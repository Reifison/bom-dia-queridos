import { useCallback, useEffect, useRef, useState } from 'react';
import { consumeGenerationCredit, getGenerationCredits, grantRewardedGenerationCredits } from '../lib/adCadence';
import { loadDailyQuota, saveDailyQuota } from '../lib/dailyGeneration';
import { getTodayLocal } from '../lib/periodDayCache';
import { generateFirebaseImage, FirebaseImageGenerationError } from '../services/firebaseImageService';
import type { PeriodId } from '../types/period';

const readCredits = () => ({ morning: getGenerationCredits('morning'), afternoon: getGenerationCredits('afternoon'), night: getGenerationCredits('night') });

/** Only this explicit user action spends an AI credit; daily content is local. */
export function useAiGeneration(day: string, activePeriod?: PeriodId) {
  const [quota, setQuota] = useState(() => loadDailyQuota(day));
  const [credits, setCredits] = useState(() => ({ day, remaining: readCredits() }));
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const locks = useRef(new Set<string>());
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setQuota(loadDailyQuota(day));
    setCredits({ day, remaining: readCredits() });
    setErrors({});
  }, [day]);

  const base = quota.day === day ? quota.remaining : loadDailyQuota(day).remaining;
  const rewarded = credits.day === day ? credits.remaining : readCredits();
  const remaining = {
    morning: base.morning + rewarded.morning,
    afternoon: base.afternoon + rewarded.afternoon,
    night: base.night + rewarded.night,
  };

  const generate = useCallback(async (period: PeriodId, apply: (image: string, day: string) => void) => {
    const requestDay = getTodayLocal();
    const key = `${requestDay}:${period}`;
    if (locks.current.has(key)) return;
    const current = quota.day === requestDay ? quota : loadDailyQuota(requestDay);
    const usingBase = current.remaining[period] > 0;
    if (!usingBase && getGenerationCredits(period) <= 0) return;
    locks.current.add(key);
    setPending((previous) => new Set(previous).add(key));
    setErrors((previous) => ({ ...previous, [key]: '' }));
    try {
      const image = await generateFirebaseImage(period);
      if (requestDay !== getTodayLocal()) return;
      apply(image, requestDay);
      if (usingBase) {
        setQuota((previous) => {
          const state = previous.day === requestDay ? previous : loadDailyQuota(requestDay);
          const next = { day: requestDay, remaining: { ...state.remaining, [period]: Math.max(0, state.remaining[period] - 1) } };
          saveDailyQuota(next);
          return next;
        });
      } else if (consumeGenerationCredit(period)) {
        setCredits({ day: requestDay, remaining: readCredits() });
      }
    } catch (error) {
      if (requestDay === getTodayLocal()) setErrors((previous) => ({
        ...previous,
        [key]: error instanceof FirebaseImageGenerationError ? error.userMessage : 'Não foi possível criar a imagem. Sua mensagem continua disponível.',
      }));
    } finally {
      locks.current.delete(key);
      setPending((previous) => { const next = new Set(previous); next.delete(key); return next; });
    }
  }, [quota]);

  const grantCredits = useCallback((period: PeriodId) => {
    grantRewardedGenerationCredits(period);
    setCredits({ day: getTodayLocal(), remaining: readCredits() });
  }, []);
  const activeKey = `${day}:${activePeriod}`;
  return {
    remaining,
    generate,
    grantCredits,
    isGenerating: !!activePeriod && pending.has(activeKey),
    error: activePeriod ? errors[activeKey] || null : null,
  };
}
