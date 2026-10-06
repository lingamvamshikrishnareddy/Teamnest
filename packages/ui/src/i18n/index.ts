import { en, type Dictionary, type TranslationKey } from './en';
import { hi } from './hi';
import { te } from './te';

export type { Dictionary, TranslationKey };
export type Locale = 'en-IN' | 'hi-IN' | 'te-IN';

export const LOCALES: { code: Locale; label: string; nativeLabel: string }[] = [
  { code: 'en-IN', label: 'English', nativeLabel: 'English' },
  { code: 'hi-IN', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'te-IN', label: 'Telugu', nativeLabel: 'తెలుగు' },
];

export const dictionaries: Record<Locale, Dictionary> = { 'en-IN': en, 'hi-IN': hi, 'te-IN': te };

export function isLocale(value: unknown): value is Locale {
  return value === 'en-IN' || value === 'hi-IN' || value === 'te-IN';
}

export type Translator = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Returns t(key, vars). Missing keys fall back to English, then to the key itself. */
export function createTranslator(locale: Locale | string | null | undefined): Translator {
  const dict = isLocale(locale) ? dictionaries[locale] : en;
  return (key, vars) => {
    const template = dict[key] ?? en[key] ?? key;
    return vars ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : template;
  };
}
