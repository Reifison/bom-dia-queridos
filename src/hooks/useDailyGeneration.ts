import { useCallback, useRef, useState } from 'react';
import { devLog } from '../lib/logger';
import {
  createVariationKey,
  generateDailyImage,
  generateDailyMessage,
} from '../services/geminiService';
import type { DailyMessage, PeriodId } from '../types/period';

const USER_ERROR = 'Não foi possível gerar agora. Tente de novo em instantes.';

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
    devLog.error('Generation failed', e);
    alert(USER_ERROR);
  }, []);

  const fetchAndBuildMessage = useCallback(async (periodId: PeriodId): Promise<DailyMessage> => {
    const generationId = createVariationKey();
    
    // Chamada para o backend que corrigimos
    const [newTextData, imagePayload] = await Promise.all([
      generateDailyMessage(periodId, generationId),
      generateDailyImage(periodId, generationId),
    ]);

    return {
      periodId,
      mainText: newTextData.mainText || 'Bom dia!',
      quote: newTextData.quote || '',
      // Tratamento seguro para a imagem (dataUrl)
      image: typeof imagePayload === 'string' ? imagePayload : (imagePayload?.dataUrl || ''),
      generationId,
    };
  }, []);

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