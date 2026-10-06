/**
 * Shared Tailwind preset (web: Tailwind 3 + shadcn/ui, mobile: NativeWind 4).
 * Colours resolve to CSS variables from theme.css, so `dark` mode and the
 * system colour scheme switch automatically and opacity modifiers work
 * (e.g. `bg-primary/10`).
 */
import type { Config } from 'tailwindcss';
import { breakpoints, radius, semanticKeys, spacing, typography, motion } from './tokens';

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const v = (name: string) => `rgb(var(--tn-${name}) / <alpha-value>)`;

const semanticColors = Object.fromEntries(
  semanticKeys.map((key) => [kebab(key), key === 'overlay' ? 'var(--tn-overlay)' : v(kebab(key))]),
);

const kpi = Object.fromEntries(
  (['blue', 'teal', 'orange', 'violet', 'pink', 'green', 'amber', 'sky'] as const).map((tone) => [
    tone,
    { DEFAULT: v(`kpi-${tone}-bg`), fg: v(`kpi-${tone}-fg`), icon: v(`kpi-${tone}-icon`) },
  ]),
);

const px = (n: number) => `${n}px`;

const preset = {
  darkMode: 'class',
  theme: {
    screens: Object.fromEntries(Object.entries(breakpoints).map(([k, n]) => [k, px(n)])),
    extend: {
      colors: {
        ...semanticColors,
        kpi,
        // shadcn/ui aliases so generated components work unchanged
        foreground: v('text'),
        card: { DEFAULT: v('surface'), foreground: v('text') },
        popover: { DEFAULT: v('surface-raised'), foreground: v('text') },
        muted: { DEFAULT: v('surface-muted'), foreground: v('text-muted') },
        input: v('border'),
        ring: v('focus-ring'),
        destructive: { DEFAULT: v('danger'), foreground: v('on-danger') },
        secondary: { DEFAULT: v('surface-muted'), foreground: v('text') },
      },
      borderRadius: {
        xs: px(radius.xs),
        sm: px(radius.sm),
        md: px(radius.md),
        lg: px(radius.lg),
        xl: px(radius.xl),
        '2xl': px(radius['2xl']),
        card: px(radius.md),
      },
      spacing: Object.fromEntries(Object.entries(spacing).map(([k, n]) => [k, px(n)])),
      fontFamily: {
        sans: typography.fontFamily.sansStack.split(',').map((f) => f.trim()),
        mono: typography.fontFamily.mono.split(',').map((f) => f.trim()),
      },
      fontSize: Object.fromEntries(
        Object.entries(typography.size).map(([k, [size, line]]) => [k, [px(size), { lineHeight: px(line) }]]),
      ),
      boxShadow: {
        card: 'var(--tn-shadow-card)',
        raised: 'var(--tn-shadow-raised)',
      },
      minHeight: { tap: '48px' },
      minWidth: { tap: '48px' },
      transitionDuration: {
        fast: `${motion.duration.fast}ms`,
        base: `${motion.duration.base}ms`,
        slow: `${motion.duration.slow}ms`,
      },
      transitionTimingFunction: { standard: motion.easing.standard },
    },
  },
} satisfies Partial<Config>;

export default preset;
