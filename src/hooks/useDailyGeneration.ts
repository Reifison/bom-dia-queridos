import { useCallback, useEffect, useRef, useState } from 'react';
import { consumeGenerationCredit, getGenerationCredits, grantRewardedGenerationCredits } from '../lib/adCadence';
import { createDailyMessageLoader, generationErrorMessage, loadDailyQuota, saveDailyQuota } from '../lib/dailyGeneration';
import { getTodayLocal } from '../lib/periodDayCache';
import { generateDailyImage, generateDailyMessage } from '../services/geminiService';
import type { DailyMessage, PeriodId } from '../types/period';

const readCredits = () => ({
  morning: getGenerationCredits('morning'),
  afternoon: getGenerationCredits('afternoon'),
  night: getGenerationCredits('night'),
});
type ApplyMessage = (message: DailyMessage, day: string) => void;

export function useDailyGeneration(day: string, activePeriod?: PeriodId) {
  const [quota, setQuota] = useState(() => loadDailyQuota(day));
  const [credits, setCredits] = useState(() => ({ day, remaining: readCredits() }));
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const loaderRef = useRef<ReturnType<typeof createDailyMessageLoader> | null>(null);
  loaderRef.current ??= createDailyMessageLoader(generateDailyMessage, generateDailyImage);
  const manualLocks = useRef(new Set<string>());

  useEffect(() => {
    setQuota(loadDailyQuota(day));
    setCredits({ day, remaining: readCredits() });
    setErrors({});
  }, [day]);

  const base = quota.day === day ? quota.remaining : loadDailyQuota(day).remaining;
  const rewarded = credits.day === day ? credits.remaining : readCredits();
  const generationsRemaining = {
    morning: base.morning + rewarded.morning,
    afternoon: base.afternoon + rewarded.afternoon,
    night: base.night + rewarded.night,
  };

  const runGeneration = useCallback(async (period: PeriodId, requestDay: string, apply: ApplyMessage) => {
    const key = `${requestDay}:${period}`;
    setPendingKeys((previous) => new Set(previous).add(key));
    setErrors((previous) => ({ ...previous, [key]: '' }));
    try {
      const message = await loaderRef.current!.load(period, requestDay);
      // A result started yesterday must not be cached as today's message.
      if (getTodayLocal() !== requestDay) return false;
      apply(message, requestDay);
      return true;
    } catch (error) {
      if (getTodayLocal() === requestDay) {
        setErrors((previous) => ({ ...previous, [key]: generationErrorMessage(error) }));
      }
      return false;
    } finally {
      setPendingKeys((previous) => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const autoGenerateForPeriod = useCallback(
    (period: PeriodId, apply: ApplyMessage) => runGeneration(period, getTodayLocal(), apply),
    [runGeneration]
  );

  const generateForPeriod = useCallback(async (period: PeriodId, apply: ApplyMessage) => {
    const requestDay = getTodayLocal();
    const key = `${requestDay}:${period}`;
    if (manualLocks.current.has(key) || loaderRef.current!.isPending(period, requestDay)) return;
    const usingBase = (requestDay === quota.day ? quota : loadDailyQuota(requestDay)).remaining[period] > 0;
    if (!usingBase && getGenerationCredits(period) <= 0) return;
    manualLocks.current.add(key);
    try {
      if (!(await runGeneration(period, requestDay, apply))) return;
      if (usingBase) {
        setQuota((previous) => {
          const current = previous.day === requestDay ? previous : loadDailyQuota(requestDay);
          const next = { day: requestDay, remaining: { ...current.remaining, [period]: Math.max(0, current.remaining[period] - 1) } };
          saveDailyQuota(next);
          return next;
        });
      } else if (consumeGenerationCredit(period)) {
        setCredits({ day: requestDay, remaining: readCredits() });
      }
    } finally { manualLocks.current.delete(key); }
  }, [quota, runGeneration]);

  const grantRewardedCredits = useCallback((period: PeriodId): number => {
    const total = grantRewardedGenerationCredits(period);
    setCredits({ day: getTodayLocal(), remaining: readCredits() });
    return total;
  }, []);

  const activeKey = `${day}:${activePeriod}`;
  return {
    generationsRemaining,
    isGenerating: !!activePeriod && pendingKeys.has(activeKey),
    generationError: activePeriod ? errors[activeKey] || null : null,
    generateForPeriod,
    autoGenerateForPeriod,
    grantRewardedCredits,
  };
}
