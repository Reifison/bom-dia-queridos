import { useCallback, useRef, useState } from 'react';
import {
  consumeGenerationCredit,
  getGenerationCredits,
  grantRewardedGenerationCredits,
} from '../lib/adCadence';
import { devLog } from '../lib/logger';
import { getTodayLocal } from '../lib/periodDayCache';
import { generateDailyImage, generateDailyMessage } from '../services/geminiService';
import type { DailyMessage, PeriodId } from '../types/period';

const USER_ERROR = 'Não foi possível gerar agora. Tente de novo em instantes.';

const QUOTA_ERROR =
  'Limite da API Google (Gemini) atingido: quota do plano gratuito esgotada ou demasiados pedidos. Ative faturação em Google AI Studio / Google Cloud Billing ou tente mais tarde.';

const MISSING_API_URL_ERROR =
  'O app não sabe onde está a API. No ficheiro .env.local defina VITE_API_ORIGIN=http://127.0.0.1:8787 (iOS Simulator), http://10.0.2.2:8787 (Android Emulator) ou http://IP-DA-MÁQUINA:8787 (dispositivo físico). Sincronize o Capacitor novamente e mantenha a API a correr.';

const INITIAL_REMAINING: Record<PeriodId, number> = {
  morning: 1,
  afternoon: 1,
  night: 1,
};

const DAILY_QUOTA_STORAGE_KEY = 'bdq_daily_generation_quota.v1';

type DailyQuotaState = {
  day: string;
  remaining: Record<PeriodId, number>;
};

function loadDailyQuota(): Record<PeriodId, number> {
  const today = getTodayLocal();
  try {
    const raw = localStorage.getItem(DAILY_QUOTA_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DailyQuotaState>;
      if (parsed.day === today && parsed.remaining) {
        return {
          morning: Math.max(0, parsed.remaining.morning ?? 0),
          afternoon: Math.max(0, parsed.remaining.afternoon ?? 0),
          night: Math.max(0, parsed.remaining.night ?? 0),
        };
      }
    }
  } catch {
    // Private mode and unavailable storage keep the session-only quota.
  }
  return { ...INITIAL_REMAINING };
}

function saveDailyQuota(remaining: Record<PeriodId, number>): void {
  try {
    localStorage.setItem(DAILY_QUOTA_STORAGE_KEY, JSON.stringify({ day: getTodayLocal(), remaining }));
  } catch {
    // The in-memory state remains usable when storage cannot be written.
  }
}

function initialRewardedCredits(): Record<PeriodId, number> {
  return {
    morning: getGenerationCredits('morning'),
    afternoon: getGenerationCredits('afternoon'),
    night: getGenerationCredits('night'),
  };
}

export function useDailyGeneration() {
  const [baseGenerationsRemaining, setBaseGenerationsRemaining] = useState(loadDailyQuota);
  const [rewardedCredits, setRewardedCredits] = useState(initialRewardedCredits);
  const [isGenerating, setIsGenerating] = useState(false);
  const manualGenerationLockRef = useRef(false);

  const generationsRemaining: Record<PeriodId, number> = {
    morning: baseGenerationsRemaining.morning + rewardedCredits.morning,
    afternoon: baseGenerationsRemaining.afternoon + rewardedCredits.afternoon,
    night: baseGenerationsRemaining.night + rewardedCredits.night,
  };

  const handleGenerationError = useCallback((e: unknown) => {
    devLog.error('Generation failed');
    const http =
      typeof e === 'object' && e !== null && 'httpStatus' in e
        ? (e as { httpStatus: number }).httpStatus
        : 0;
    const code = e instanceof Error ? e.message : '';
    if (code === 'MISSING_VITE_API_ORIGIN') {
      alert(MISSING_API_URL_ERROR);
    } else if (http === 429 || code === 'QUOTA_EXCEEDED') {
      alert(QUOTA_ERROR);
    } else {
      alert(USER_ERROR);
    }
  }, []);

  const fetchAndBuildMessage = useCallback(async (periodId: PeriodId): Promise<DailyMessage> => {
    const [newTextData, imagePayload] = await Promise.all([
      generateDailyMessage(periodId),
      generateDailyImage(periodId),
    ]);
    return {
      periodId,
      mainText: newTextData.mainText,
      quote: newTextData.quote,
      image: imagePayload,
    };
  }, []);

  /** Entrada no detalhe: uma geração por período por dia, independente dos outros menus. */
  const autoGenerateForPeriod = useCallback(
    async (periodId: PeriodId, applyMessage: (msg: DailyMessage) => void) => {
      setIsGenerating(true);
      try {
        const msg = await fetchAndBuildMessage(periodId);
        applyMessage(msg);
      } catch (e) {
        handleGenerationError(e);
      } finally {
        setIsGenerating(false);
      }
    },
    [fetchAndBuildMessage, handleGenerationError]
  );

  const generateForPeriod = useCallback(
    async (periodId: PeriodId, applyMessage: (msg: DailyMessage) => void) => {
      if (manualGenerationLockRef.current) return;
      const usingBaseQuota = (baseGenerationsRemaining[periodId] ?? 0) > 0;
      const usingRewardedCredit = !usingBaseQuota && (rewardedCredits[periodId] ?? 0) > 0;
      if (!usingBaseQuota && !usingRewardedCredit) return;

      manualGenerationLockRef.current = true;
      setIsGenerating(true);
      try {
        const msg = await fetchAndBuildMessage(periodId);
        applyMessage(msg);
        if (usingBaseQuota) {
          setBaseGenerationsRemaining((prev) => {
            const next = { ...prev, [periodId]: Math.max(0, (prev[periodId] ?? 0) - 1) };
            saveDailyQuota(next);
            return next;
          });
        } else if (consumeGenerationCredit(periodId)) {
          setRewardedCredits((prev) => ({
            ...prev,
            [periodId]: getGenerationCredits(periodId),
          }));
        }
      } catch (e) {
        handleGenerationError(e);
      } finally {
        setIsGenerating(false);
        manualGenerationLockRef.current = false;
      }
    },
    [baseGenerationsRemaining, fetchAndBuildMessage, handleGenerationError, rewardedCredits]
  );

  const grantRewardedCredits = useCallback((periodId: PeriodId): number => {
    const total = grantRewardedGenerationCredits(periodId);
    setRewardedCredits((prev) => ({ ...prev, [periodId]: total }));
    return total;
  }, []);

  return {
    generationsRemaining,
    rewardedCredits,
    isGenerating,
    generateForPeriod,
    autoGenerateForPeriod,
    grantRewardedCredits,
  };
}
