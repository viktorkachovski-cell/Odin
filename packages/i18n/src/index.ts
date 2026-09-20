import { bg } from './bg.ts';
import { en } from './en.ts';
import type { TranslationKey } from './keys.ts';

export type { TranslationKey } from './keys.ts';
export { TRANSLATION_KEYS } from './keys.ts';
export { bg } from './bg.ts';
export { en } from './en.ts';

export type Locale = 'en' | 'bg';

export const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = {
  en,
  bg,
};

export type TranslateParams = Readonly<Record<string, string | number>>;

/**
 * Substitutes `{name}` placeholders. An unknown key returns the key itself so a
 * missing translation is visible in tests and review rather than rendering an
 * empty element.
 */
export function translate(locale: Locale, key: TranslationKey, params?: TranslateParams): string {
  const template = DICTIONARIES[locale][key] ?? key;
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function createTranslator(locale: Locale) {
  return (key: TranslationKey, params?: TranslateParams): string => translate(locale, key, params);
}

export type Translator = ReturnType<typeof createTranslator>;

/** Device locale to a supported locale; anything else falls back to English. */
export function resolveLocale(candidate: string | null | undefined): Locale {
  if (candidate === null || candidate === undefined) return 'en';
  return candidate.toLowerCase().startsWith('bg') ? 'bg' : 'en';
}
