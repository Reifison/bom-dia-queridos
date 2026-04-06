import { buildApiUrl } from '../lib/apiBase';
import { devLog } from '../lib/logger';
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

async function postJson<T>(path: string, body: object): Promise<T> {
  const url = buildApiUrl(path);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

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
  period: PeriodId
): Promise<{ mainText: string; quote?: string }> {
  return postJson('/api/generate-message', { period });
}

export async function generateDailyImage(period: PeriodId): Promise<string> {
  const { image } = await postJson<{ image: string }>('/api/generate-image', { period });
  return image;
}
