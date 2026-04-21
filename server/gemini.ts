import { ApiError, GoogleGenAI, Modality, Type } from '@google/genai';
import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai';

export type PeriodId = 'morning' | 'afternoon' | 'night';

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY_MISSING');
  return new GoogleGenAI({ apiKey: key });
}

async function inlineDataToDataUrl(mimeType: string | undefined, base64: string): Promise<string> {
  const mime = (mimeType || 'image/jpeg').toLowerCase();
  return `data:${mime};base64,${base64}`;
}

async function firstInlineAsDataUrl(response: GenerateContentResponse): Promise<string | null> {
  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return await inlineDataToDataUrl(part.inlineData.mimeType, part.inlineData.data);
    }
  }
  return null;
}

export async function generateDailyMessage(period: PeriodId, options?: { variationKey?: string }) {
  const ai = getClient();
  const periodNames = { morning: 'manhã', afternoon: 'tarde', night: 'noite' };
  const prompt = `Crie uma mensagem motivacional curta para a ${periodNames[period]}. Retorne JSON: mainText e quote.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          mainText: { type: Type.STRING },
          quote: { type: Type.STRING },
        },
        required: ['mainText'],
      },
    },
  });

  return JSON.parse(response.text.trim());
}

export async function generateDailyImage(period: PeriodId, options?: { variationKey?: string }): Promise<string> {
  const ai = getClient();
  const periodPrompts = {
    morning: 'Nascer do sol suave, café, flores, luz da manhã.',
    afternoon: 'Tarde ensolarada, paisagem tranquila, luz dourada.',
    night: 'Céu estrelado, lua, paisagem noturna serena.',
  };

  const text = `${periodPrompts[period]} alta qualidade, sem texto.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: text,
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      imageConfig: { aspectRatio: '3:4' },
    },
  });

  const dataUrl = await firstInlineAsDataUrl(response);
  if (!dataUrl) throw new Error('NO_IMAGE_GENERATED');
  return dataUrl;
}

export function formatGeminiErrorForLog(err: unknown): string {
  if (err instanceof ApiError) return `ApiError ${err.status}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}