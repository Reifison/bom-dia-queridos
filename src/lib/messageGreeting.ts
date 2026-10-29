import type { PeriodId } from '../types/period';
import { getAppLocale, type AppLocale } from './locale';

const GREETINGS: Record<AppLocale, Record<PeriodId, string>> = {
  pt: {
    morning: 'Bom dia, queridos!',
    afternoon: 'Boa tarde, queridos!',
    night: 'Boa noite, queridos!',
  },
  en: {
    morning: 'Good morning, friends!',
    afternoon: 'Good afternoon, friends!',
    night: 'Good night, friends!',
  },
};

/** The same punctuated greeting is used on the card, image and copied text. */
export function messageGreeting(period: PeriodId, locale: AppLocale = getAppLocale()): string {
  return GREETINGS[locale][period];
}
