import { describe, expect, it } from 'vitest';
import { createTranslator, dictionaries } from './index';
import { en } from './en';

describe('i18n', () => {
  it('hi and te define every English key with the same placeholders', () => {
    for (const [locale, dict] of Object.entries(dictionaries)) {
      for (const key of Object.keys(en) as Array<keyof typeof en>) {
        expect(dict[key], `${locale} missing ${key}`).toBeTruthy();
        const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
        expect(vars(dict[key]), `${locale} placeholders for ${key}`).toBe(vars(en[key]));
      }
    }
  });

  it('interpolates and falls back to English', () => {
    expect(createTranslator('hi-IN')('greeting.morning', { name: 'प्रिया' })).toBe('सुप्रभात, प्रिया');
    expect(createTranslator('xx')('tabs.home')).toBe('Home');
    expect(createTranslator('te-IN')('tabs.work')).toBe('పని');
  });
});
