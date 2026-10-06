import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useColorScheme as useSystemScheme } from 'react-native';
import { useColorScheme as useNativewindScheme } from 'nativewind';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkTheme, kpiTones, lightTheme, type SemanticTheme, type ThemeName } from '@teamnest/ui';

type Preference = 'system' | 'light' | 'dark';
interface ThemeValue {
  name: ThemeName;
  colors: SemanticTheme;
  kpi: (typeof kpiTones)[ThemeName];
  preference: Preference;
  setPreference: (p: Preference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);
const KEY = 'tn.theme';

/** Exposes token colours for places classNames can't reach (icons, status bar, tab bar). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useSystemScheme();
  const { colorScheme, setColorScheme } = useNativewindScheme();

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((p) => {
      if (p === 'light' || p === 'dark' || p === 'system') setColorScheme(p);
    });
  }, [setColorScheme]);

  const name: ThemeName = (colorScheme ?? system) === 'dark' ? 'dark' : 'light';
  const value = useMemo<ThemeValue>(
    () => ({
      name,
      colors: name === 'dark' ? darkTheme : lightTheme,
      kpi: kpiTones[name],
      preference: (colorScheme as Preference) ?? 'system',
      setPreference: (p) => {
        setColorScheme(p);
        AsyncStorage.setItem(KEY, p);
      },
    }),
    [name, colorScheme, setColorScheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
