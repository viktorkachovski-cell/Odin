import { en } from './en.ts';

/** The English dictionary is the source of truth for the key set. */
export type TranslationKey = keyof typeof en;

export const TRANSLATION_KEYS = Object.keys(en) as readonly TranslationKey[];
