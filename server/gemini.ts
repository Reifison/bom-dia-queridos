import { ApiError, GoogleGenAI, Modality, Type } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
import sharp from 'sharp';

export type PeriodId = 'morning' | 'afternoon' | 'night';
export type AppLocale = 'pt' | 'en';

function getClient() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  return new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 40_000, retryOptions: { attempts: 1 } } });
}

/** WKWebView (Capacitor/iOS) costuma falhar com AVIF; converter para JPEG no servidor. */
async function inlineDataToIosSafeDataUrl(
  mimeType: string | undefined,
  base64: string
): Promise<string> {
  if (mimeType && !mimeType.startsWith('image/')) throw new Error('NO_IMAGE_IN_RESPONSE');
  const input = Buffer.from(base64, 'base64');
  const jpeg = await sharp(input).rotate()
    .resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
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

async function firstInlineAsDataUrl(
  response: GenerateContentResponse
): Promise<string | null> {
  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (!part.thought && part.inlineData?.data) {
      return await inlineDataToIosSafeDataUrl(part.inlineData.mimeType, part.inlineData.data);
    }
  }
  return null;
}

export function buildDailyMessagePrompt(period: PeriodId, locale: AppLocale = 'pt'): string {
  if (locale === 'en') {
    return `Write a short, warm, encouraging message for the ${period}.
      Write every user-facing field in natural English. Keep it optimistic, easy to read, and suitable for sharing on WhatsApp.
      Return JSON with:
      - mainText: The main message, up to 160 characters (required).
      - quote: A short quote, up to 120 characters (optional; include one only when its authorship is certain, and keep it in English).`;
  }
  const periodNames = { morning: 'manhã', afternoon: 'tarde', night: 'noite' };
  return `Crie uma mensagem motivacional curta e acolhedora para o período da ${periodNames[period]}.
    Escreva todos os campos voltados ao usuário em português natural do Brasil. A mensagem deve ser otimista, fácil de ler e perfeita para compartilhar no WhatsApp.
    Retorne um JSON com:
    - mainText: A frase principal, com até 160 caracteres (obrigatório).
    - quote: Uma citação curta, com até 120 caracteres (opcional; inclua somente se tiver certeza da autoria e mantenha-a em português).`;
}

export async function generateDailyMessage(
  period: PeriodId,
  locale: AppLocale = 'pt',
): Promise<{ mainText: string; quote?: string }> {
  const ai = getClient();
  const prompt = buildDailyMessagePrompt(period, locale);

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_TEXT_MODEL?.trim() || 'gemini-3.1-flash-lite',
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
  let data: { mainText?: unknown; quote?: unknown };
  try { data = JSON.parse(response.text.trim()); }
  catch { throw new Error('INVALID_TEXT_RESPONSE'); }
  if (!data || typeof data.mainText !== 'string' || !data.mainText.trim() ||
      (data.quote !== undefined && typeof data.quote !== 'string')) {
    throw new Error('INVALID_TEXT_RESPONSE');
  }
  return { mainText: data.mainText.trim(), ...(typeof data.quote === 'string' ? { quote: data.quote.trim() } : {}) };
}

/**
 * Only retry against an explicitly configured fallback; retired models must not be used silently.
 */
export async function generateDailyImage(period: PeriodId): Promise<string> {
  const ai = getClient();

  const periodPrompts = {
    morning:
      'Nascer do sol suave, xícara de café, flores frescas, luz da manhã, fotografia de alta qualidade, acolhedor, sem texto.',
    afternoon:
      'Tarde ensolarada, paisagem tranquila, luz dourada, natureza, fotografia de alta qualidade, relaxante, sem texto.',
    night:
      'Céu estrelado, lua, paisagem noturna serena, luzes suaves, fotografia de alta qualidade, pacífico, sem texto.',
  };

  const text = periodPrompts[period];

  const models = [...new Set([
    process.env.GEMINI_IMAGE_MODEL?.trim() || 'gemini-3.1-flash-image',
    process.env.GEMINI_IMAGE_FALLBACK_MODEL?.trim(),
  ].filter((model): model is string => !!model))];

  let lastError: unknown = new Error('NO_IMAGE_ATTEMPTS');

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: text,
        config: { responseModalities: [Modality.TEXT, Modality.IMAGE], imageConfig: { aspectRatio: '3:4' } },
      });
      const dataUrl = await firstInlineAsDataUrl(response);
      if (dataUrl) {
        return dataUrl;
      }
      logImageResponseShape(model, response);
      lastError = new Error('NO_IMAGE_IN_RESPONSE');
    } catch (e) {
      lastError = e;
      if (e instanceof ApiError) {
        console.error('[gemini]', model, formatGeminiErrorForLog(e));
        if ([401, 403, 429].includes(e.status)) {
          throw e;
        }
      } else if (e instanceof Error) {
        console.error('[gemini]', model, formatGeminiErrorForLog(e));
      } else {
        console.error('[gemini]', model, formatGeminiErrorForLog(e));
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(String(lastError));
}

/** Para o Express: mensagem segura no log (sem PII). */
export function formatGeminiErrorForLog(err: unknown): string {
  const redact = (text: string) => {
    const key = process.env.GEMINI_API_KEY?.trim();
    return (key ? text.split(key).join('[REDACTED]') : text).slice(0, 500);
  };
  if (err instanceof ApiError) {
    return redact(`ApiError ${err.status}: ${err.message}`);
  }
  if (err instanceof Error) {
    return redact(err.message);
  }
  return redact(String(err));
}
