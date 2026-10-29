import { buildApiUrl } from '../lib/apiBase';
import { devLog } from '../lib/logger';
import { getAppLocale, type AppLocale } from '../lib/locale';
import type { PeriodId } from '../types/period';

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

export async function postJson<T>(path: string, body: object, timeoutMs = 100_000): Promise<T> {
  const url = buildApiUrl(path);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    let data: unknown = null;
    try { data = await res.json(); }
    catch { data = null; }

    if (!res.ok) throwApiFailure(path, res, data);

    if (!data || typeof data !== 'object') throw new Error('INVALID_GENERATION_RESPONSE');
    return data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('GENERATION_TIMEOUT');
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function generateDailyMessage(
  period: PeriodId,
  locale: AppLocale = getAppLocale(),
): Promise<{ mainText: string; quote?: string }> {
  const data = await postJson<{ mainText: string; quote?: string }>('/api/generate-message', { period, locale });
  if (typeof data.mainText !== 'string' || !data.mainText.trim() ||
      (data.quote !== undefined && typeof data.quote !== 'string')) {
    throw new Error('INVALID_GENERATION_RESPONSE');
  }
  return data;
}

export async function generateDailyImage(period: PeriodId): Promise<string> {
  const { image } = await postJson<{ image: string }>('/api/generate-image', { period });
  if (typeof image !== 'string' || !/^data:image\/(png|jpeg|webp|avif);base64,\S+$/.test(image)) {
    throw new Error('INVALID_GENERATION_RESPONSE');
  }
  return image;
}
