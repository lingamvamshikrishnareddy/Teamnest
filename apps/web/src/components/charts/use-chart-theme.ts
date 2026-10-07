'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { chartPalette, darkTheme, lightTheme } from '@teamnest/ui';

/** Resolved series colours + axis/grid ink for the active theme. */
export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === 'dark';
  const t = dark ? darkTheme : lightTheme;
  return {
    series: chartPalette[dark ? 'dark' : 'light'] as readonly string[],
    other: t.textMuted,
    grid: t.border,
    axis: t.textMuted,
    surface: t.surface,
    text: t.text,
  };
}
