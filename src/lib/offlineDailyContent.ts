import type { DailyMessage, Period, PeriodId } from '../types/period';
import { OFFLINE_MESSAGES_BY_LOCALE } from '../constants/offlineMessages';
import { getAppLocale, type AppLocale } from './locale';

export type OfflineLayoutId = 'soft' | 'open' | 'cozy';
export type PeriodArgument = PeriodId | Pick<Period, 'id'>;

export interface OfflineDailyMessage extends DailyMessage {
  source: 'offline';
  offline: {
    origin: 'bundled';
    dayKey: string;
    variation: number;
    imageKey: string;
    layoutId: OfflineLayoutId;
  };
}

export interface OfflineDailyImage {
  key: string;
  src: string;
}

/** Bundled image paths stay local in Vite builds and Capacitor web assets. */
export const OFFLINE_DAILY_IMAGES: Readonly<Record<PeriodId, readonly OfflineDailyImage[]>> = {
  morning: [
    { key: 'morning-01-sunrise', src: '/images/daily/morning-01-sunrise.jpg' },
    { key: 'morning-02-rose', src: '/images/daily/morning-02-rose.jpg' },
    { key: 'morning-03-sunset-flowers', src: '/images/daily/morning-03-sunset-flowers.jpg' },
    { key: 'morning-04-pink-roses', src: '/images/daily/morning-04-pink-roses.jpg' },
    { key: 'morning-05-dahlia', src: '/images/daily/morning-05-dahlia.jpg' },
    { key: 'morning-06-summer-flowers', src: '/images/daily/morning-06-summer-flowers.jpg' },
    { key: 'morning-07-wildflowers', src: '/images/daily/morning-07-wildflowers.jpg' },
    { key: 'morning-08-pink-garden', src: '/images/daily/morning-08-pink-garden.jpg' },
    { key: 'morning-09-mountain-wildflowers', src: '/images/daily/morning-09-mountain-wildflowers.jpg' },
    { key: 'morning-10-mums', src: '/images/daily/morning-10-mums.jpg' },
    { key: 'morning-11-purple-yellow-garden', src: '/images/daily/morning-11-purple-yellow-garden.jpg' },
    { key: 'morning-12-purple-vine', src: '/images/daily/morning-12-purple-vine.jpg' },
    { key: 'morning-13-purple-yellow-garden', src: '/images/daily/morning-13-purple-yellow-garden.jpg' },
    { key: 'morning-14-purple-daisy', src: '/images/daily/morning-14-purple-daisy.jpg' },
    { key: 'morning-15-colorful-field', src: '/images/daily/morning-15-colorful-field.jpg' },
    { key: 'morning-16-golden-sunflowers', src: '/images/daily/morning-16-golden-sunflowers.jpg' },
    { key: 'morning-17-sunflower-field', src: '/images/daily/morning-17-sunflower-field.jpg' },
    { key: 'morning-18-purple-yellow-field', src: '/images/daily/morning-18-purple-yellow-field.jpg' },
    { key: 'morning-19-pink-waterlily', src: '/images/daily/morning-19-pink-waterlily.jpg' },
    { key: 'morning-20-yellow-purple-flowers', src: '/images/daily/morning-20-yellow-purple-flowers.jpg' },
    { key: 'morning-21-greenhouse-flowers', src: '/images/daily/morning-21-greenhouse-flowers.jpg' },
    { key: 'morning-22-greenhouse-sunlight', src: '/images/daily/morning-22-greenhouse-sunlight.jpg' },
    { key: 'morning-23-sun-drenched-garden', src: '/images/daily/morning-23-sun-drenched-garden.jpg' },
    { key: 'morning-24-red-yellow-flowers', src: '/images/daily/morning-24-red-yellow-flowers.jpg' },
    { key: 'morning-25-yellow-red-meadow', src: '/images/daily/morning-25-yellow-red-meadow.jpg' },
    { key: 'morning-26-white-flowers-leaves', src: '/images/daily/morning-26-white-flowers-leaves.jpg' },
    { key: 'morning-27-purple-irises-dawn', src: '/images/daily/morning-27-purple-irises-dawn.jpg' },
    { key: 'morning-28-orange-flowers', src: '/images/daily/morning-28-orange-flowers.jpg' },
    { key: 'morning-29-ranunculus-meadow', src: '/images/daily/morning-29-ranunculus-meadow.jpg' },
    { key: 'morning-30-pink-blossoms', src: '/images/daily/morning-30-pink-blossoms.jpg' },
    { key: 'morning-31-colorful-garden', src: '/images/daily/morning-31-colorful-garden.jpg' },
    { key: 'morning-32-jacaranda-path', src: '/images/daily/morning-32-jacaranda-path.jpg' },
    { key: 'morning-33-coneflowers-garden', src: '/images/daily/morning-33-coneflowers-garden.jpg' },
    { key: 'morning-34-garden-bridge', src: '/images/daily/morning-34-garden-bridge.jpg' },
    { key: 'morning-35-misty-grass-field', src: '/images/daily/morning-35-misty-grass-field.jpg' },
    { key: 'morning-36-garden-path-bench', src: '/images/daily/morning-36-garden-path-bench.jpg' },
    { key: 'morning-37-foggy-lake', src: '/images/daily/morning-37-foggy-lake.jpg' },
    { key: 'morning-38-lakeside-forest', src: '/images/daily/morning-38-lakeside-forest.jpg' },
    { key: 'morning-39-morning-grass', src: '/images/daily/morning-39-morning-grass.jpg' },
    { key: 'morning-40-golden-hills', src: '/images/daily/morning-40-golden-hills.jpg' },
    { key: 'morning-41-misty-mountain-ridges', src: '/images/daily/morning-41-misty-mountain-ridges.jpg' },
    { key: 'morning-42-sunbeams-through-trees', src: '/images/daily/morning-42-sunbeams-through-trees.jpg' },
    { key: 'morning-43-misty-wildflowers', src: '/images/daily/morning-43-misty-wildflowers.jpg' },
    { key: 'morning-44-alpine-lake-sunlight', src: '/images/daily/morning-44-alpine-lake-sunlight.jpg' },
    { key: 'morning-45-mountain-silhouette', src: '/images/daily/morning-45-mountain-silhouette.jpg' },
    { key: 'morning-46-latte-and-croissant', src: '/images/daily/morning-46-latte-and-croissant.jpg' },
    { key: 'morning-47-white-teacup', src: '/images/daily/morning-47-white-teacup.jpg' },
    { key: 'morning-48-steaming-coffee', src: '/images/daily/morning-48-steaming-coffee.jpg' },
    { key: 'morning-49-coffee-in-nature', src: '/images/daily/morning-49-coffee-in-nature.jpg' },
    { key: 'morning-50-green-mug-morning', src: '/images/daily/morning-50-green-mug-morning.jpg' },
  ],
  afternoon: [
    { key: 'afternoon-01-dew', src: '/images/daily/afternoon-01-dew.jpg' },
    { key: 'afternoon-02-golden-retriever', src: '/images/daily/afternoon-02-golden-retriever.jpg' },
    { key: 'afternoon-03-puppies-playing', src: '/images/daily/afternoon-03-puppies-playing.jpg' },
    { key: 'afternoon-04-labrador-wildflowers', src: '/images/daily/afternoon-04-labrador-wildflowers.jpg' },
    { key: 'afternoon-05-golden-puppies', src: '/images/daily/afternoon-05-golden-puppies.jpg' },
    { key: 'afternoon-06-corgis-garden', src: '/images/daily/afternoon-06-corgis-garden.jpg' },
    { key: 'afternoon-07-dogs-playing', src: '/images/daily/afternoon-07-dogs-playing.jpg' },
    { key: 'afternoon-08-sunny-puppy', src: '/images/daily/afternoon-08-sunny-puppy.jpg' },
    { key: 'afternoon-09-dog-flowers', src: '/images/daily/afternoon-09-dog-flowers.jpg' },
    { key: 'afternoon-10-puppy-toy', src: '/images/daily/afternoon-10-puppy-toy.jpg' },
    { key: 'afternoon-11-lake-reflection', src: '/images/daily/afternoon-11-lake-reflection.jpg' },
    { key: 'afternoon-12-sao-paulo-lake', src: '/images/daily/afternoon-12-sao-paulo-lake.jpg' },
    { key: 'afternoon-13-mountain-lake', src: '/images/daily/afternoon-13-mountain-lake.jpg' },
    { key: 'afternoon-14-lake-mountains', src: '/images/daily/afternoon-14-lake-mountains.jpg' },
    { key: 'afternoon-15-forest-lake', src: '/images/daily/afternoon-15-forest-lake.jpg' },
    { key: 'afternoon-16-dusk-lake', src: '/images/daily/afternoon-16-dusk-lake.jpg' },
    { key: 'afternoon-17-pond-koi', src: '/images/daily/afternoon-17-pond-koi.jpg' },
    { key: 'afternoon-18-green-tree-lake', src: '/images/daily/afternoon-18-green-tree-lake.jpg' },
    { key: 'afternoon-19-aerial-lake', src: '/images/daily/afternoon-19-aerial-lake.jpg' },
    { key: 'afternoon-20-golden-dog-flowers', src: '/images/daily/afternoon-20-golden-dog-flowers.jpg' },
    { key: 'afternoon-21-two-happy-dogs', src: '/images/daily/afternoon-21-two-happy-dogs.jpg' },
    { key: 'afternoon-22-corgi-running', src: '/images/daily/afternoon-22-corgi-running.jpg' },
    { key: 'afternoon-23-french-bulldog-puppy', src: '/images/daily/afternoon-23-french-bulldog-puppy.jpg' },
    { key: 'afternoon-24-golden-retriever-field', src: '/images/daily/afternoon-24-golden-retriever-field.jpg' },
    { key: 'afternoon-25-small-white-dog', src: '/images/daily/afternoon-25-small-white-dog.jpg' },
    { key: 'afternoon-26-yellow-labrador-puppy', src: '/images/daily/afternoon-26-yellow-labrador-puppy.jpg' },
    { key: 'afternoon-27-golden-retriever-play', src: '/images/daily/afternoon-27-golden-retriever-play.jpg' },
    { key: 'afternoon-28-golden-retriever-running', src: '/images/daily/afternoon-28-golden-retriever-running.jpg' },
    { key: 'afternoon-29-golden-retriever-resting', src: '/images/daily/afternoon-29-golden-retriever-resting.jpg' },
    { key: 'afternoon-30-two-puppies-running', src: '/images/daily/afternoon-30-two-puppies-running.jpg' },
    { key: 'afternoon-31-curly-puppy-green-field', src: '/images/daily/afternoon-31-curly-puppy-green-field.jpg' },
    { key: 'afternoon-32-two-dogs-resting', src: '/images/daily/afternoon-32-two-dogs-resting.jpg' },
    { key: 'afternoon-33-dog-sitting-grass', src: '/images/daily/afternoon-33-dog-sitting-grass.jpg' },
    { key: 'afternoon-34-brown-dog-green-field', src: '/images/daily/afternoon-34-brown-dog-green-field.jpg' },
    { key: 'afternoon-35-dog-running-green-field', src: '/images/daily/afternoon-35-dog-running-green-field.jpg' },
    { key: 'afternoon-36-lake-mountain-daylight', src: '/images/daily/afternoon-36-lake-mountain-daylight.jpg' },
    { key: 'afternoon-37-alpine-lake-reflection', src: '/images/daily/afternoon-37-alpine-lake-reflection.jpg' },
    { key: 'afternoon-38-calm-lake-sandy-shore', src: '/images/daily/afternoon-38-calm-lake-sandy-shore.jpg' },
    { key: 'afternoon-39-waterfall-turquoise-pool', src: '/images/daily/afternoon-39-waterfall-turquoise-pool.jpg' },
    { key: 'afternoon-40-forest-lake-slope', src: '/images/daily/afternoon-40-forest-lake-slope.jpg' },
    { key: 'afternoon-41-calm-forest-lake', src: '/images/daily/afternoon-41-calm-forest-lake.jpg' },
    { key: 'afternoon-42-waterfall-jungle-pool', src: '/images/daily/afternoon-42-waterfall-jungle-pool.jpg' },
    { key: 'afternoon-43-waterfall-forest-pool', src: '/images/daily/afternoon-43-waterfall-forest-pool.jpg' },
    { key: 'afternoon-44-grassy-hills-sheep', src: '/images/daily/afternoon-44-grassy-hills-sheep.jpg' },
    { key: 'afternoon-45-calm-park-river', src: '/images/daily/afternoon-45-calm-park-river.jpg' },
    { key: 'afternoon-46-sunlit-river-forest', src: '/images/daily/afternoon-46-sunlit-river-forest.jpg' },
    { key: 'afternoon-47-river-pine-forest', src: '/images/daily/afternoon-47-river-pine-forest.jpg' },
    { key: 'afternoon-48-tuscan-green-hills', src: '/images/daily/afternoon-48-tuscan-green-hills.jpg' },
    { key: 'afternoon-49-transylvanian-hills', src: '/images/daily/afternoon-49-transylvanian-hills.jpg' },
    { key: 'afternoon-50-umbria-hills-farmhouse', src: '/images/daily/afternoon-50-umbria-hills-farmhouse.jpg' },
  ],
  night: [
    { key: 'night-01-moon', src: '/images/daily/night-01-moon.jpg' },
    { key: 'night-02-sleeping-dog', src: '/images/daily/night-02-sleeping-dog.jpg' },
    { key: 'night-03-milky-way', src: '/images/daily/night-03-milky-way.jpg' },
    { key: 'night-04-moon-clouds', src: '/images/daily/night-04-moon-clouds.jpg' },
    { key: 'night-05-starry-hills', src: '/images/daily/night-05-starry-hills.jpg' },
    { key: 'night-06-full-moon-clouds', src: '/images/daily/night-06-full-moon-clouds.jpg' },
    { key: 'night-07-stars-water', src: '/images/daily/night-07-stars-water.jpg' },
    { key: 'night-08-stars-trees', src: '/images/daily/night-08-stars-trees.jpg' },
    { key: 'night-09-moon-over-clouds', src: '/images/daily/night-09-moon-over-clouds.jpg' },
    { key: 'night-10-milky-way-badlands', src: '/images/daily/night-10-milky-way-badlands.jpg' },
    { key: 'night-11-moon-dark-clouds', src: '/images/daily/night-11-moon-dark-clouds.jpg' },
    { key: 'night-12-star-lake', src: '/images/daily/night-12-star-lake.jpg' },
    { key: 'night-13-sleeping-dog-bed', src: '/images/daily/night-13-sleeping-dog-bed.jpg' },
    { key: 'night-14-bernese-dog-rest', src: '/images/daily/night-14-bernese-dog-rest.jpg' },
    { key: 'night-15-cat-snooze', src: '/images/daily/night-15-cat-snooze.jpg' },
    { key: 'night-16-sleeping-dog-bed', src: '/images/daily/night-16-sleeping-dog-bed.jpg' },
    { key: 'night-17-white-cat-sleeping', src: '/images/daily/night-17-white-cat-sleeping.jpg' },
    { key: 'night-18-cat-sleeping-closeup', src: '/images/daily/night-18-cat-sleeping-closeup.jpg' },
    { key: 'night-19-stars-mountain', src: '/images/daily/night-19-stars-mountain.jpg' },
    { key: 'night-20-moon-ocean', src: '/images/daily/night-20-moon-ocean.jpg' },
    { key: 'night-21-star-mountain-moon', src: '/images/daily/night-21-star-mountain-moon.jpg' },
    { key: 'night-22-alpine-stars', src: '/images/daily/night-22-alpine-stars.jpg' },
    { key: 'night-23-mountain-range-stars', src: '/images/daily/night-23-mountain-range-stars.jpg' },
    { key: 'night-24-canyon-stars', src: '/images/daily/night-24-canyon-stars.jpg' },
    { key: 'night-25-mountain-stars-italy', src: '/images/daily/night-25-mountain-stars-italy.jpg' },
    { key: 'night-26-full-moon-dark-sky', src: '/images/daily/night-26-full-moon-dark-sky.jpg' },
    { key: 'night-27-starry-beach', src: '/images/daily/night-27-starry-beach.jpg' },
    { key: 'night-28-aurora-rural', src: '/images/daily/night-28-aurora-rural.jpg' },
    { key: 'night-29-aurora-iceland-lake', src: '/images/daily/night-29-aurora-iceland-lake.jpg' },
    { key: 'night-30-aurora-finland', src: '/images/daily/night-30-aurora-finland.jpg' },
    { key: 'night-31-starry-lake-reflection', src: '/images/daily/night-31-starry-lake-reflection.jpg' },
    { key: 'night-32-aurora-lake-sweden', src: '/images/daily/night-32-aurora-lake-sweden.jpg' },
    { key: 'night-33-aurora-snow-field', src: '/images/daily/night-33-aurora-snow-field.jpg' },
    { key: 'night-34-aurora-pine-forest', src: '/images/daily/night-34-aurora-pine-forest.jpg' },
    { key: 'night-35-lake-sky-reflection', src: '/images/daily/night-35-lake-sky-reflection.jpg' },
    { key: 'night-36-stars-over-forest', src: '/images/daily/night-36-stars-over-forest.jpg' },
    { key: 'night-37-moon-ocean-rising', src: '/images/daily/night-37-moon-ocean-rising.jpg' },
    { key: 'night-38-moon-over-ocean', src: '/images/daily/night-38-moon-over-ocean.jpg' },
    { key: 'night-39-moon-lake-brazil', src: '/images/daily/night-39-moon-lake-brazil.jpg' },
    { key: 'night-40-moon-clouds-ocean', src: '/images/daily/night-40-moon-clouds-ocean.jpg' },
    { key: 'night-41-moon-lake-mountains', src: '/images/daily/night-41-moon-lake-mountains.jpg' },
    { key: 'night-42-moonlit-ocean-clouds', src: '/images/daily/night-42-moonlit-ocean-clouds.jpg' },
    { key: 'night-43-full-moon-lake', src: '/images/daily/night-43-full-moon-lake.jpg' },
    { key: 'night-44-moonlit-city', src: '/images/daily/night-44-moonlit-city.jpg' },
    { key: 'night-45-sleeping-cat-dog', src: '/images/daily/night-45-sleeping-cat-dog.jpg' },
    { key: 'night-46-pets-cozy-bed', src: '/images/daily/night-46-pets-cozy-bed.jpg' },
    { key: 'night-47-cat-bed', src: '/images/daily/night-47-cat-bed.jpg' },
    { key: 'night-48-sleeping-cat-peacefully', src: '/images/daily/night-48-sleeping-cat-peacefully.jpg' },
    { key: 'night-49-aurora-borealis', src: '/images/daily/night-49-aurora-borealis.jpg' },
    { key: 'night-50-milky-way-lake', src: '/images/daily/night-50-milky-way-lake.jpg' },
  ],
};

const PERIODS: readonly PeriodId[] = ['morning', 'afternoon', 'night'];
const PERIOD_OFFSETS: Record<PeriodId, number> = { morning: 0, afternoon: 11, night: 22 };
const LAYOUT_IDS: readonly OfflineLayoutId[] = ['soft', 'open', 'cozy'];
const MESSAGE_STEP = 13;
const VARIATION_TEXT_STEP = 5;

function resolvePeriod(period: PeriodArgument): PeriodId {
  const candidate = typeof period === 'string' ? period : period?.id;
  if (typeof candidate !== 'string' || !PERIODS.includes(candidate as PeriodId)) {
    throw new RangeError('Período inválido para conteúdo offline.');
  }
  return candidate as PeriodId;
}

/** Parse a local calendar key without consulting the device clock or timezone. */
function dayOrdinal(dayKey: string): number {
  if (typeof dayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    throw new RangeError('A data deve usar o formato YYYY-MM-DD.');
  }

  const [year, month, day] = dayKey.split('-').map(Number);
  const monthLengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthLengths[month - 1]) {
    throw new RangeError('Data inválida para conteúdo offline.');
  }

  const utcDate = new Date(0);
  utcDate.setUTCFullYear(year, month - 1, day);
  utcDate.setUTCHours(0, 0, 0, 0);
  return Math.floor(utcDate.getTime() / 86_400_000);
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/**
 * Return a stable offline message for an explicit local YYYY-MM-DD key.
 * The optional variation is a non-negative safe integer. Variation one changes
 * the text, photo, and visual variant; variation zero remains date-stable.
 * Adjacent days never repeat within a period at the same variation.
 */
export function getOfflineDailyMessage(
  period: PeriodArgument,
  dayKey: string,
  variation = 0,
  locale: AppLocale = getAppLocale(),
): OfflineDailyMessage {
  if (!Number.isSafeInteger(variation) || variation < 0) {
    throw new RangeError('A variação deve ser um inteiro seguro não negativo.');
  }

  const periodId = resolvePeriod(period);
  const ordinal = dayOrdinal(dayKey);
  const offset = PERIOD_OFFSETS[periodId];
  const messages = OFFLINE_MESSAGES_BY_LOCALE[locale][periodId];
  const images = OFFLINE_DAILY_IMAGES[periodId];

  const textIndex = modulo(
    modulo(ordinal * MESSAGE_STEP, messages.length) +
      offset +
      modulo(variation, messages.length) * VARIATION_TEXT_STEP,
    messages.length,
  );
  const imageIndex = modulo(
    modulo(ordinal, images.length) + offset + modulo(variation, images.length),
    images.length,
  );
  const layoutIndex = modulo(
    modulo(ordinal * 2, LAYOUT_IDS.length) + offset + modulo(variation, LAYOUT_IDS.length),
    LAYOUT_IDS.length,
  );
  const mainText = messages[textIndex];
  const image = images[imageIndex];
  const layoutId = LAYOUT_IDS[layoutIndex];

  return {
    periodId,
    mainText,
    image: image.src,
    source: 'offline',
    offline: { origin: 'bundled', dayKey, variation, imageKey: image.key, layoutId },
  };
}

/** Return the stable local card cover used when a period has no daily message. */
export function getOfflinePeriodCover(period: PeriodArgument): string {
  return OFFLINE_DAILY_IMAGES[resolvePeriod(period)][0].src;
}
