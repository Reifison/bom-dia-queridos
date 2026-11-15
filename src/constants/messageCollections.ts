import type { AppLocale } from '../lib/locale';
import { COLLECTION_MESSAGES_EN } from './collectionMessagesEn';
import type { PeriodId } from '../types/period';
import { COLLECTION_MESSAGES } from './collectionMessages';

export const MESSAGE_COLLECTIONS = {
  weekday: 'Dia da semana',
  family: 'Família, amizade e amor',
  support: 'Carinho e apoio',
  faith: 'Gratidão e fé',
  birthday: 'Aniversário',
  achievement: 'Conquistas',
  christmas: 'Natal',
  newYear: 'Ano Novo',
} as const;

export type MessageCollection = keyof typeof MESSAGE_COLLECTIONS;

const COLLECTION_BACKGROUNDS: Record<MessageCollection, string> = {
  weekday: '/images/greetings/{period}-light-1.jpg',
  family: '/images/greetings/{period}-path-1.jpg',
  support: '/images/greetings/{period}-pets-1.jpg',
  faith: '/images/greetings/{period}-light-1.jpg',
  birthday: '/images/greetings/celebration-birthday.jpg',
  achievement: '/images/greetings/celebration-achievement.jpg',
  christmas: '/images/greetings/celebration-christmas.jpg',
  newYear: '/images/greetings/celebration-new-year.jpg',
};

export function getCollection(period: PeriodId, day: string, collection: MessageCollection, locale: AppLocale = 'pt') {
  const image = COLLECTION_BACKGROUNDS[collection].replace('{period}', period);
  const catalog = locale === 'en' ? COLLECTION_MESSAGES_EN : COLLECTION_MESSAGES;
  const messages = collection === 'weekday'
    ? catalog.weekday[new Date(day + 'T00:00:00Z').getUTCDay()]
    : catalog[collection];
  return { image, messages };
}
