import { ApiError } from '@google/genai';

export function classifyGenerationError(error: unknown): { status: number; code: string } {
  const message = error instanceof Error ? error.message : '';
  if (message === 'GEMINI_API_KEY_MISSING') return { status: 503, code: 'SERVICE_NOT_CONFIGURED' };
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return { status: 503, code: 'PROVIDER_AUTH_FAILED' };
    if (error.status === 404) return { status: 503, code: 'MODEL_UNAVAILABLE' };
    if (error.status === 429) return { status: 429, code: 'QUOTA_EXCEEDED' };
    if (error.status >= 500) return { status: 503, code: 'PROVIDER_UNAVAILABLE' };
  }
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
    return { status: 504, code: 'GENERATION_TIMEOUT' };
  }
  if (['EMPTY_TEXT_RESPONSE', 'INVALID_TEXT_RESPONSE', 'NO_IMAGE_IN_RESPONSE'].includes(message)) {
    return { status: 502, code: 'INVALID_GENERATION_RESPONSE' };
  }
  return { status: 502, code: 'GENERATION_FAILED' };
}
