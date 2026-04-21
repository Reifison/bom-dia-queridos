import { ApiError, GoogleGenAI, Modality, Type } from '@google/genai';
import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai';

export type PeriodId = 'morning' | 'afternoon' | 'night';

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  return new GoogleGenAI({ apiKey: key });
}

function logImageResponseShape(label: string, response: GenerateContentResponse) {
  const c0 = response.candidates?.[0];
  const parts = c0?.content?.parts || [];
  const partSummary = parts.map((p) =>
    p.inlineData ? `inlineData(${p.inlineData.mimeType || '?'})` : p.text != null ? 'text' : 'other'
  );
  console.error(
    '[gemini] response:',
    JSON.stringify({
      attempt: label,
      candidateCount: response.candidates?.length ?? 0,
      finishReason: c0?.finishReason,
      blockReason: response.promptFeedback?.blockReason,
      partSummary,
    })
  );
}

// Retorna a imagem diretamente
async function firstInlineAsDataUrl(
  response: GenerateContentResponse
): Promise<string | null> {
  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType || 'image/jpeg';
      return `data:${mime};base64,${part.inlineData.data}`;
    }
  }
  return null;
}

export async function generateDailyMessage(
  period: PeriodId,
  options?: { variationKey?: string }
): Promise<{ mainText: string; quote?: string }> {
  const ai = getClient();

  const periodNames = { morning: 'manhã', afternoon: 'tarde', night: 'noite' };

  const variationBlock = options?.variationKey
    ? `\n\nIMPORTANTE — pedido id ${options.variationKey}: este pedido DEVE produzir texto totalmente NOVO e diferente de qualquer resposta anterior (varie vocabulário, ritmo, imagem da frase e, se houver quote, o autor ou filme).`
    : '';

  const prompt = `Crie uma mensagem motivacional curta e acolhedora para o período da ${periodNames[period]}.
    A mensagem deve ser otimista, fácil de ler e perfeita para compartilhar no WhatsApp.
    Retorne um JSON com:
    - mainText: A frase principal (obrigatório).
    - quote: Uma citação curta de um autor ou filme (opcional, use apenas se agregar valor).${variationBlock}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          mainText: { type: Type.STRING, description: 'Frase principal da mensagem' },
          quote: { type: Type.STRING, description: 'Citação opcional' },
        },
        required: ['mainText'],
      },
    },
  });

  if (!response.text) {
    throw new Error('EMPTY_TEXT_RESPONSE');
  }
  return JSON.parse(response.text.trim()) as { mainText: string; quote?: string };
}

export async function generateDailyImage(
  period: PeriodId,
  options?: { variationKey?: string }
): Promise<string> {
  const ai = getClient();

  const periodPrompts = {
    morning: 'Nascer do sol suave, xícara de café, flores frescas, luz da manhã, fotografia de alta qualidade, acolhedor, sem texto.',
    afternoon: 'Tarde ensolarada, paisagem tranquila, luz dourada, natureza, fotografia de alta qualidade, relaxante, sem texto.',
    night: 'Céu estrelado, lua, paisagem noturna serena, luzes suaves, fotografia de alta qualidade, pacífico, sem texto.',
  };

  const variationBlock = options?.variationKey
    ? ` Variação visual única [pedido ${options.variationKey}]: altere enquadramento, paleta de cores predominante, perspetiva e pequenos detalhes da cena para que a imagem seja claramente diferente de qualquer geração anterior com o mesmo tema.`
    : '';

  const text = `${periodPrompts[period]}${variationBlock}`;

  const attempts: { label: string; params: GenerateContentParameters }[] = [
    {
      label: 'gemini-3.1-flash-image-preview + modalities + aspect',
      params: {
        model: 'gemini-3.1-flash-image-preview',
        contents: text,
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
          imageConfig: { aspectRatio: '3:4' }, 
        },
      },
    },
    {
      label: 'gemini-2.5-flash-image + aspect',
      params: {
        model: 'gemini-2.5-flash-image',
        contents: text,
        config: {
          imageConfig: { aspectRatio: '3:4' },
        },
      },
    }
  ];

  let lastError: unknown = new Error('NO_IMAGE_ATTEMPTS');

  for (const { label, params } of attempts) {
    try {
      const response = await ai.models.generateContent(params);
      logImageResponseShape(label, response);
      const dataUrl = await firstInlineAsDataUrl(response);
      if (dataUrl) {
        return dataUrl;
      }
      lastError = new Error(`NO_IMAGE_IN_RESPONSE:${label}`);
    } catch (e) {
      lastError = e;
      if (e instanceof ApiError && e.status === 429) throw e;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(String(lastError));
}

export function formatGeminiErrorForLog(err: unknown): string {
  if (err instanceof ApiError) return `ApiError ${err.status}: ${err.message}`.slice(0, 500);
  if (err instanceof Error) return err.message.slice(0, 500);
  return String(err).slice(0, 500);
}