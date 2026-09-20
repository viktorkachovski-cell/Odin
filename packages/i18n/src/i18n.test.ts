import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@odin/contracts';

import { bg } from './bg.ts';
import { en } from './en.ts';
import { createTranslator, resolveLocale, translate } from './index.ts';
import { TRANSLATION_KEYS } from './keys.ts';

const PLACEHOLDER = /\{(\w+)\}/g;

function placeholdersOf(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '').sort();
}

describe('locale parity', () => {
  it('declares exactly the same keys in both languages', () => {
    expect(Object.keys(bg).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty or whitespace-only strings', () => {
    for (const key of TRANSLATION_KEYS) {
      expect(en[key].trim(), `en.${key}`).not.toBe('');
      expect(bg[key].trim(), `bg.${key}`).not.toBe('');
    }
  });

  it('uses the same placeholders in both languages', () => {
    for (const key of TRANSLATION_KEYS) {
      expect(placeholdersOf(bg[key]), `placeholders for ${key}`).toEqual(placeholdersOf(en[key]));
    }
  });

  it('translates every error code the contract defines', () => {
    for (const code of ERROR_CODES) {
      const key = `error.${code.toLowerCase()}`;
      expect(TRANSLATION_KEYS, `missing ${key}`).toContain(key);
    }
  });

  it('leaves Bulgarian actually translated, not copied from English', () => {
    // A handful of proper nouns legitimately match; everything else must differ.
    const allowedIdentical = new Set(['app.name', 'locale.en', 'locale.bg']);
    const identical = TRANSLATION_KEYS.filter(
      (key) => !allowedIdentical.has(key) && en[key] === bg[key],
    );
    expect(identical).toEqual([]);
  });
});

describe('translate', () => {
  it('substitutes named parameters', () => {
    expect(translate('en', 'home.progress', { completed: 1, total: 3, percent: 33 })).toBe(
      '1 of 3 done · 33%',
    );
    expect(translate('bg', 'home.progress', { completed: 1, total: 3, percent: 33 })).toBe(
      '1 от 3 готови · 33%',
    );
  });

  it('leaves an unknown placeholder visible instead of printing undefined', () => {
    expect(translate('en', 'home.copy_template', {})).toBe('Create list from {title}');
  });

  it('binds a locale once through createTranslator', () => {
    const t = createTranslator('bg');
    expect(t('nav.my_tasks')).toBe('Моите задачи');
  });
});

describe('resolveLocale', () => {
  it('maps device locales onto the supported set', () => {
    expect(resolveLocale('bg')).toBe('bg');
    expect(resolveLocale('bg-BG')).toBe('bg');
    expect(resolveLocale('en-GB')).toBe('en');
    expect(resolveLocale('de-DE')).toBe('en');
    expect(resolveLocale(null)).toBe('en');
  });
});
