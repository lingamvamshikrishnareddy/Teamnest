import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from 'react';
import { getLocales } from 'expo-localization';
import { createTranslator, isLocale, type Locale, type Translator } from '@teamnest/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from './auth';

interface I18nValue {
  locale: Locale;
  t: Translator;
  setLocale: (l: Locale) => Promise<void>;
}

const I18nContext = createContext<I18nValue | null>(null);

function deviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode;
  return code === 'hi' ? 'hi-IN' : code === 'te' ? 'te-IN' : 'en-IN';
}

/** Language comes from the user's profile (synced across devices), else the device. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { context } = useAuth();
  const [locale, setLocaleState] = useState<Locale>(deviceLocale());

  useEffect(() => {
    const fromProfile = context?.user.locale;
    if (isLocale(fromProfile)) setLocaleState(fromProfile);
  }, [context?.user.locale]);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: createTranslator(locale),
      setLocale: async (l) => {
        setLocaleState(l);
        if (context?.user.id) await supabase.from('users').update({ locale: l }).eq('id', context.user.id);
      },
    }),
    [locale, context?.user.id],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
