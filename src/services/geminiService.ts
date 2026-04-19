import { buildApiUrl } from '../lib/apiBase';
import { devLog } from '../lib/logger';
import type { PeriodId } from '../types/period';

export function createVariationKey(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function throwApiFailure(path: string, res: Response, data: unknown): never {
  const code =
    data && typeof data === 'object' && data !== null && 'error' in data
      ? String((data as { error: unknown }).error)
      : 'API_ERROR';
  devLog.error('API request failed', path, res.status, code);
  const err = new Error(code) as Error & { httpStatus: number };
  err.httpStatus = res.status;
  throw err;
}

async function postJson<T>(path: string, body: object): Promise<T> {
  const url = buildApiUrl(path);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof TypeError) {
      const err = new Error('NETWORK_ERROR') as Error & { httpStatus: number };
      err.httpStatus = 0;
      throw err;
    }
    throw e;
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throwApiFailure(path, res, data);
  }

  return data as T;
}

export async function generateDailyMessage(
  period: PeriodId,
  variationKey: string
): Promise<{ mainText: string; quote?: string }> {
  return postJson('/api/generate-message', { period, variationKey });
}

export async function generateDailyImage(period: PeriodId, variationKey: string): Promise<string> {
  const { image } = await postJson<{ image: string }>('/api/generate-image', { period, variationKey });
  return image;
}
