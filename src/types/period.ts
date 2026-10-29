export type PeriodId = 'morning' | 'afternoon' | 'night';

export interface Period {
  id: PeriodId;
  title: string;
  subtitle: string;
  tag: string;
  image: string;
  isEnabled: boolean;
}

export interface DailyMessage {
  periodId: PeriodId;
  mainText: string;
  quote?: string;
  image: string;
  source?: 'offline' | 'firebase' | 'personal';
  bankImageId?: string;
  textPosition?: { x: number; y: number };
  generationFlow?: {
    day: string;
    manualBankRefreshes: number;
  };
  offline?: {
    origin: 'bundled';
    dayKey: string;
    variation: number;
    imageKey: string;
    layoutId: 'soft' | 'open' | 'cozy';
  };
}

export function isDailyMessage(value: unknown): value is DailyMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<DailyMessage>;
  return (
    ['morning', 'afternoon', 'night'].includes(message.periodId ?? '') &&
    typeof message.mainText === 'string' && message.mainText.trim().length > 0 &&
    (message.quote === undefined || typeof message.quote === 'string') &&
    typeof message.image === 'string' &&
    (message.textPosition === undefined || !!message.textPosition &&
      [message.textPosition.x, message.textPosition.y].every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)) &&
    (/^(data:image\/(png|jpeg|webp|avif);base64,\S+|https?:\/\/\S+)$/.test(message.image) || isBundledDailyImage(message.image)) &&
    (message.source === undefined || message.source === 'offline' || message.source === 'firebase' || message.source === 'personal')
  );
}

export function isBundledDailyImage(image: string): boolean {
  return /^\/?images\/daily\/[a-z0-9-]+\.jpg$/.test(image);
}

/** Old remote cache entries remain stored, but never gate the offline daily flow. */
export function isOfflineReadyMessage(message: DailyMessage): boolean {
  return isDailyMessage(message) &&
    (isBundledDailyImage(message.image) || /^data:image\/(png|jpeg|webp|avif);base64,\S+$/.test(message.image));
}
