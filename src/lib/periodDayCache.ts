import type { DailyMessage, PeriodId } from '../types/period';

const SESSION_KEY = (id: PeriodId) => `bdq_periodDay_${id}`;

const PERIOD_IDS: PeriodId[] = ['morning', 'afternoon', 'night'];

export function getTodayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type PeriodDayEntry = { day: string; message: DailyMessage };

export function loadSessionPeriodDayMessages(): Partial<Record<PeriodId, PeriodDayEntry>> {
  const today = getTodayLocal();
  const result: Partial<Record<PeriodId, PeriodDayEntry>> = {};
  for (const id of PERIOD_IDS) {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY(id));
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { day?: string; message?: DailyMessage };
      if (parsed.day !== today || !parsed.message || parsed.message.periodId !== id) continue;
      result[id] = { day: parsed.day, message: parsed.message };
    } catch {
      // ignore
    }
  }
  return result;
}

export function saveSessionPeriodDayMessage(
  periodId: PeriodId,
  day: string,
  message: DailyMessage
): void {
  try {
    sessionStorage.setItem(SESSION_KEY(periodId), JSON.stringify({ day, message }));
  } catch {
    // quota / private mode
  }
}
