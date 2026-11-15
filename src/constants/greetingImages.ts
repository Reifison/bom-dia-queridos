import type { AppLocale } from '../lib/locale';
import { GREETING_MESSAGES_EN } from './greetingMessagesEn';
import type { PeriodId } from '../types/period';
import { GREETING_MESSAGES, type GreetingTheme } from './greetingMessages';

interface GreetingImage {
  key: string;
  src: string;
  theme: GreetingTheme;
}

const createImages = (period: PeriodId, theme: GreetingTheme, count: number): GreetingImage[] =>
  Array.from({ length: count }, (_, index) => {
    const key = `${period}-${theme}-${index + 1}`;
    return { key, src: `/images/greetings/${key}.jpg`, theme };
  });

export const GREETING_IMAGES: Record<PeriodId, readonly GreetingImage[]> = {
  morning: [
    ...createImages('morning', 'pets', 10),
    ...createImages('morning', 'coffee', 1),
    ...createImages('morning', 'flowers', 1),
    ...createImages('morning', 'path', 1),
    ...createImages('morning', 'light', 1),
  ],
  afternoon: [
    ...createImages('afternoon', 'pets', 10),
    ...createImages('afternoon', 'coffee', 1),
    ...createImages('afternoon', 'flowers', 1),
    ...createImages('afternoon', 'path', 1),
    ...createImages('afternoon', 'light', 1),
  ],
  night: [
    ...createImages('night', 'pets', 10),
    ...createImages('night', 'coffee', 1),
    ...createImages('night', 'path', 1),
    ...createImages('night', 'light', 1),
  ],
};

const GREETING_MESSAGES_BY_LOCALE: Record<AppLocale, typeof GREETING_MESSAGES> = {
  pt: GREETING_MESSAGES,
  en: GREETING_MESSAGES_EN,
};

export function greetingMessagesForImage(period: PeriodId, src?: string, locale: AppLocale = 'pt'): readonly string[] | undefined {
  const image = GREETING_IMAGES[period].find((entry) => entry.src === src);
  return image && GREETING_MESSAGES_BY_LOCALE[locale][period][image.theme];
}
