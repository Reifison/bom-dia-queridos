import { useCallback, useRef, useState } from 'react';
import { devLog } from '../lib/logger';
import { generateDailyImage, generateDailyMessage } from '../services/geminiService';
import type { DailyMessage, PeriodId } from '../types/period';

const USER_ERROR = 'Não foi possível gerar agora. Tente de novo em instantes.';

const QUOTA_ERROR =
  'Limite da API Google (Gemini) atingido: quota do plano gratuito esgotada ou demasiados pedidos. Ative faturação em Google AI Studio / Google Cloud Billing ou tente mais tarde.';

const MISSING_API_URL_ERROR =
  'O app iOS não sabe onde está a API. No ficheiro .env.local defina VITE_API_ORIGIN=http://127.0.0.1:8787 (simulador) ou http://IP-DO-MAC:8787 (iPhone na mesma Wi‑Fi). Depois: npm run ios:sync e volte a abrir no Xcode. No Mac, mantenha npm run start a correr.';

const INITIAL_REMAINING: Record<PeriodId, number> = {
  morning: 1,
  afternoon: 1,
  night: 1,
};

export function useDailyGeneration() {
  const [generationsRemaining, setGenerationsRemaining] = useState<Record<PeriodId, number>>({
    ...INITIAL_REMAINING,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const manualGenerationLockRef = useRef(false);

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
      if ((generationsRemaining[periodId] ?? 0) <= 0) return;

      manualGenerationLockRef.current = true;
      setIsGenerating(true);
      try {
        const msg = await fetchAndBuildMessage(periodId);
        applyMessage(msg);
        setGenerationsRemaining((prev) => ({
          ...prev,
          [periodId]: Math.max(0, (prev[periodId] ?? 0) - 1),
        }));
      } catch (e) {
        handleGenerationError(e);
      } finally {
        setIsGenerating(false);
        manualGenerationLockRef.current = false;
      }
    },
    [fetchAndBuildMessage, generationsRemaining, handleGenerationError]
  );

  return {
    generationsRemaining,
    isGenerating,
    generateForPeriod,
    autoGenerateForPeriod,
  };
}
