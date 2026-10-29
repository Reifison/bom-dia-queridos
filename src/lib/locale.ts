import { ENGLISH } from '../constants/translations';

export type AppLocale = 'pt' | 'en';

declare global {
  interface Window { __appLocale?: AppLocale }
}

/** Match supported languages in preference order, including every Portuguese region. */
export function resolveAppLocale(languages: readonly string[]): AppLocale {
  for (const language of languages) {
    const base = language.toLowerCase().split(/[-_]/)[0];
    if (base === 'pt' || base === 'en') return base;
  }
  return 'en';
}

export function getAppLocale(): AppLocale {
  // iOS supplies Bundle.preferredLocalizations, respecting its per-app language setting.
  if (typeof window !== 'undefined' && (window.__appLocale === 'pt' || window.__appLocale === 'en')) return window.__appLocale;
  if (typeof window === 'undefined') return 'pt';
  if (typeof navigator !== 'undefined') return resolveAppLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
  // Existing server-side callers without a user locale retain Portuguese content.
  return 'pt';
}

export function t(text: string, locale: AppLocale = getAppLocale()): string {
  return locale === 'en' ? ENGLISH[text] ?? text : text;
}

export function applyDocumentLocale(): void {
  document.documentElement.lang = getAppLocale() === 'pt' ? 'pt' : 'en';
  document.title = t('Bom dia queridos');
  const description = document.querySelector('meta[name="description"]');
  if (getAppLocale() === 'en') description?.setAttribute('content', 'Create good morning, good afternoon and good night messages with beautiful images to share every day.');
}
