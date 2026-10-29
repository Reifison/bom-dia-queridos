import { t } from '../lib/locale';
import { FEATURE_FLAGS } from './featureFlags';
import type { DailyMessage, Period, PeriodId } from '../types/period';
import { getOfflineDailyMessage, getOfflinePeriodCover } from '../lib/offlineDailyContent';
import { getTodayLocal } from '../lib/periodDayCache';

export const PERIODS: Period[] = [
  {
    id: 'morning',
    title: t('BOM DIA'),
    subtitle: t('Comece o dia com luz e gratidão.'),
    tag: t('Manhã Radiante'),
    image: getOfflinePeriodCover('morning'),
    isEnabled: FEATURE_FLAGS.ENABLE_MORNING,
  },
  {
    id: 'afternoon',
    title: t('BOA TARDE'),
    subtitle: t('Um momento de pausa e calor no coração.'),
    tag: t('Tarde Acolhedora'),
    image: getOfflinePeriodCover('afternoon'),
    isEnabled: FEATURE_FLAGS.ENABLE_AFTERNOON,
  },
  {
    id: 'night',
    title: t('BOA NOITE'),
    subtitle: t('Descanse sob a paz das estrelas.'),
    tag: t('Noite Serena'),
    image: getOfflinePeriodCover('night'),
    isEnabled: FEATURE_FLAGS.ENABLE_NIGHT,
  },
];

export const INITIAL_MESSAGES: Record<PeriodId, DailyMessage> = {
  morning: getOfflineDailyMessage('morning', getTodayLocal()),
  afternoon: getOfflineDailyMessage('afternoon', getTodayLocal()),
  night: getOfflineDailyMessage('night', getTodayLocal()),
};
