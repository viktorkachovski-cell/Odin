import type { CommandError } from '@odin/contracts';

import { bg } from './bg.ts';
import { en } from './en.ts';
import { TRANSLATION_KEYS, type TranslationKey } from './keys.ts';

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

/**
 * A typed error as text. The server's `message_key` is used when it is one we
 * ship, otherwise the generic message for its code: a raw key or SQL text must
 * never reach the user.
 */
export function errorMessage(error: CommandError, t: Translator): string {
  return (TRANSLATION_KEYS as readonly string[]).includes(error.message_key)
    ? t(error.message_key as TranslationKey)
    : t(`error.${error.code.toLowerCase()}` as TranslationKey);
}

/** A field's validation issue as the text shown under it, or nothing. */
export function issueText(
  issue: { readonly message_key: string } | null,
  t: Translator,
): string | undefined {
  return issue === null ? undefined : t(issue.message_key as TranslationKey);
}

const INTL_LOCALES: Readonly<Record<Locale, string>> = { en: 'en-GB', bg: 'bg-BG' };

/**
 * Building a formatter is slow on Hermes and a list formats one date per row,
 * so formatters are reused. A formatter keeps the time zone it was built in,
 * hence the current offset in the key: a phone that travels gets a new one.
 */
const dueFormats = new Map<string, Intl.DateTimeFormat>();

/** A task deadline as both clients show it: the date plus a short local time. */
export function formatDueAt(
  dueAt: string,
  locale: Locale,
  dateStyle: 'medium' | 'full' = 'medium',
): string {
  const key = `${locale}:${dateStyle}:${String(new Date().getTimezoneOffset())}`;
  let format = dueFormats.get(key);
  if (format === undefined) {
    format = new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle, timeStyle: 'short' });
    dueFormats.set(key, format);
  }
  return format.format(new Date(dueAt));
}

/** Device locale to a supported locale; anything else falls back to English. */
export function resolveLocale(candidate: string | null | undefined): Locale {
  if (candidate === null || candidate === undefined) return 'en';
  return candidate.toLowerCase().startsWith('bg') ? 'bg' : 'en';
}
