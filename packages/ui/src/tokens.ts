/**
 * TeamNest design tokens — the single source of truth for web (Tailwind +
 * shadcn/ui CSS variables) and mobile (NativeWind + React Native styles).
 *
 * Brand: royal blue headers, teal accents, orange highlights on a light
 * grey canvas with white 12px cards. Every text/background pair used by the
 * semantic theme meets WCAG AA (4.5:1) — see tokens.test.ts.
 */

// ---------------------------------------------------------------------------
// Raw palette (never reference these directly in components — use `theme`)
// ---------------------------------------------------------------------------
export const palette = {
  blue: {
    50: '#EFF5FF', 100: '#DBE7FE', 200: '#BFD4FE', 300: '#93B7FD', 400: '#6094FA',
    500: '#3B76F6', 600: '#2563EB', 700: '#1D4FD8', 800: '#1E40AF', 900: '#1E3A8A', 950: '#172554',
  },
  teal: {
    50: '#EFFCF9', 100: '#C9F6EE', 200: '#94ECDD', 300: '#58DBC8', 400: '#2DC4B1',
    500: '#14B8A6', 600: '#0D9488', 700: '#0F766E', 800: '#115E59', 900: '#134E4A', 950: '#042F2E',
  },
  orange: {
    50: '#FFF6ED', 100: '#FFEAD4', 200: '#FED1A8', 300: '#FDB071', 400: '#FB8A3C',
    500: '#F97316', 600: '#EA580C', 700: '#C2410C', 800: '#9A3412', 900: '#7C2D12', 950: '#431407',
  },
  slate: {
    0: '#FFFFFF', 25: '#F9FAFC', 50: '#F4F6FA', 100: '#EEF1F6', 200: '#E3E8EF', 300: '#CBD3DF',
    400: '#98A2B3', 500: '#667085', 600: '#4B5565', 700: '#364152', 800: '#202939', 900: '#121926', 950: '#0B1220',
  },
  green: { 50: '#ECFDF3', 100: '#D1FADF', 500: '#22C55E', 600: '#16A34A', 700: '#15803D', 400: '#4ADE80' },
  amber: { 50: '#FFFAEB', 100: '#FEF0C7', 500: '#F59E0B', 600: '#D97706', 700: '#B45309', 400: '#FBBF24' },
  red: { 50: '#FEF3F2', 100: '#FEE4E2', 500: '#EF4444', 600: '#DC2626', 700: '#B91C1C', 400: '#F87171' },
  sky: { 50: '#F0F9FF', 100: '#E0F2FE', 500: '#0EA5E9', 600: '#0284C7', 700: '#0369A1', 400: '#38BDF8' },
  violet: { 50: '#F5F3FF', 100: '#EDE9FE', 500: '#8B5CF6', 600: '#7C3AED', 700: '#6D28D9', 400: '#A78BFA' },
  pink: { 50: '#FDF2F8', 100: '#FCE7F3', 500: '#EC4899', 600: '#DB2777', 700: '#BE185D', 400: '#F472B6' },
} as const;

/** Blend two hex colours: t = 0 → a, t = 1 → b. Used for solid dark-mode tints. */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = p(a);
  const [br, bg, bb] = p(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(ar!, br!)}${c(ag!, bg!)}${c(ab!, bb!)}`.toUpperCase();
}

const DARK_SURFACE = '#111A2E';
const tint = (c: string, t = 0.16) => mix(DARK_SURFACE, c, t);

// ---------------------------------------------------------------------------
// Semantic themes
// ---------------------------------------------------------------------------
export interface SemanticTheme {
  background: string;        // app canvas
  surface: string;           // cards, sheets
  surfaceMuted: string;      // inputs, table stripes, chips
  surfaceRaised: string;     // popovers, menus
  border: string;
  borderStrong: string;
  text: string;              // primary text
  textMuted: string;         // secondary text
  textSubtle: string;        // placeholders, captions (large text / icons only)
  primary: string;           // royal blue: headers, primary buttons, links
  primaryHover: string;
  primaryText: string;       // blue used as TEXT on surface
  onPrimary: string;
  primarySoft: string;       // tinted backgrounds
  header: string;            // app header / mobile top bar
  onHeader: string;
  accent: string;            // teal: active states, progress, toggles (fills / icons)
  accentText: string;        // teal used as TEXT
  onAccent: string;
  accentSoft: string;
  highlight: string;         // orange: offers, badges, highlights (fills / icons)
  highlightText: string;
  onHighlight: string;
  highlightSoft: string;
  success: string; successSoft: string;
  warning: string; warningSoft: string;
  danger: string;  dangerSoft: string;  onDanger: string;
  info: string;    infoSoft: string;
  focusRing: string;
  overlay: string;           // modal scrim (only non-hex token)
}

export const lightTheme: SemanticTheme = {
  background: palette.slate[50],      // #F4F6FA
  surface: palette.slate[0],
  surfaceMuted: palette.slate[100],
  surfaceRaised: palette.slate[0],
  border: palette.slate[200],
  borderStrong: palette.slate[300],
  text: palette.slate[900],
  textMuted: palette.slate[600],
  textSubtle: palette.slate[500],
  primary: palette.blue[600],         // #2563EB
  primaryHover: palette.blue[700],
  primaryText: palette.blue[700],
  onPrimary: '#FFFFFF',
  primarySoft: palette.blue[50],
  header: palette.blue[600],
  onHeader: '#FFFFFF',
  accent: palette.teal[500],          // #14B8A6
  accentText: palette.teal[700],
  onAccent: palette.teal[950],
  accentSoft: palette.teal[50],
  highlight: palette.orange[500],     // #F97316
  highlightText: palette.orange[700],
  onHighlight: palette.orange[950],
  highlightSoft: palette.orange[50],
  success: palette.green[700], successSoft: palette.green[50],
  warning: palette.amber[700], warningSoft: palette.amber[50],
  danger: palette.red[700],    dangerSoft: palette.red[50], onDanger: '#FFFFFF',
  info: palette.sky[700],      infoSoft: palette.sky[50],
  focusRing: palette.blue[500],
  overlay: 'rgba(11, 18, 32, 0.48)',
};

export const darkTheme: SemanticTheme = {
  background: palette.slate[950],     // #0B1220
  surface: DARK_SURFACE,
  surfaceMuted: '#18233A',
  surfaceRaised: '#1B2741',
  border: '#26324A',
  borderStrong: '#34425E',
  text: '#E8EDF6',
  textMuted: '#A3AEC2',
  textSubtle: '#7F8BA2',
  primary: palette.blue[600],
  primaryHover: palette.blue[500],
  primaryText: palette.blue[300],
  onPrimary: '#FFFFFF',
  primarySoft: tint(palette.blue[500]),
  header: '#0F1A33',
  onHeader: '#FFFFFF',
  accent: palette.teal[400],
  accentText: palette.teal[300],
  onAccent: palette.teal[950],
  accentSoft: tint(palette.teal[500]),
  highlight: palette.orange[400],
  highlightText: palette.orange[300],
  onHighlight: palette.orange[950],
  highlightSoft: tint(palette.orange[500]),
  success: palette.green[400], successSoft: tint(palette.green[500], 0.14),
  warning: palette.amber[400], warningSoft: tint(palette.amber[500], 0.14),
  danger: palette.red[400],    dangerSoft: tint(palette.red[500], 0.14), onDanger: palette.slate[950],
  info: palette.sky[400],      infoSoft: tint(palette.sky[500], 0.14),
  focusRing: palette.blue[400],
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const themes = { light: lightTheme, dark: darkTheme } as const;
export type ThemeName = keyof typeof themes;

// ---------------------------------------------------------------------------
// Pastel KPI tiles (bg / fg / icon-bg) — Month Summary & dashboards
// ---------------------------------------------------------------------------
export type KpiTone = 'blue' | 'teal' | 'orange' | 'violet' | 'pink' | 'green' | 'amber' | 'sky';

export const kpiTones: Record<ThemeName, Record<KpiTone, { bg: string; fg: string; icon: string }>> = {
  light: {
    blue:   { bg: '#EAF1FF', fg: palette.blue[800],   icon: '#D3E2FF' },
    teal:   { bg: '#E3F8F4', fg: palette.teal[800],   icon: '#C4EFE7' },
    orange: { bg: '#FFF0E3', fg: palette.orange[800], icon: '#FFDDC2' },
    violet: { bg: '#F1EDFF', fg: palette.violet[700], icon: '#E0D8FF' },
    pink:   { bg: '#FDEBF3', fg: palette.pink[700],   icon: '#FAD4E5' },
    green:  { bg: '#E8F7EC', fg: palette.green[700],  icon: '#CDEFD6' },
    amber:  { bg: '#FFF5DB', fg: palette.amber[700],  icon: '#FDE7AE' },
    sky:    { bg: '#E5F5FD', fg: palette.sky[700],    icon: '#C8EAFA' },
  },
  dark: {
    blue:   { bg: tint(palette.blue[500], 0.14),   fg: palette.blue[300],   icon: tint(palette.blue[500], 0.26) },
    teal:   { bg: tint(palette.teal[500], 0.14),   fg: palette.teal[300],   icon: tint(palette.teal[500], 0.26) },
    orange: { bg: tint(palette.orange[500], 0.14), fg: palette.orange[300], icon: tint(palette.orange[500], 0.26) },
    violet: { bg: tint(palette.violet[500], 0.16), fg: palette.violet[400], icon: tint(palette.violet[500], 0.28) },
    pink:   { bg: tint(palette.pink[500], 0.14),   fg: palette.pink[400],   icon: tint(palette.pink[500], 0.26) },
    green:  { bg: tint(palette.green[500], 0.14),  fg: palette.green[400],  icon: tint(palette.green[500], 0.26) },
    amber:  { bg: tint(palette.amber[500], 0.14),  fg: palette.amber[400],  icon: tint(palette.amber[500], 0.26) },
    sky:    { bg: tint(palette.sky[500], 0.14),    fg: palette.sky[400],    icon: tint(palette.sky[500], 0.26) },
  },
};

/** Trend arrow colours: up = good unless the metric is "lower is better". */
export const trend = {
  light: { up: palette.green[700], down: palette.red[600], flat: palette.slate[500] },
  dark: { up: palette.green[400], down: palette.red[400], flat: '#A3AEC2' },
} as const;

/**
 * Categorical chart series in fixed order (never cycled), per theme.
 * Validated with the dataviz palette checker: lightness band, chroma floor,
 * CVD + normal-vision separation of adjacent pairs, and contrast vs surface
 * (light mode's contrast WARN is met with direct labels + table views).
 * A 9th series folds into "Other" (textMuted).
 */
export const chartPalette = {
  light: ['#2563EB', '#14B8A6', '#F97316', '#8B5CF6', '#EC4899', '#F59E0B', '#0EA5E9', '#16A34A'],
  dark: ['#3B76F6', '#0D9488', '#EA580C', '#8B5CF6', '#EC4899', '#D97706', '#0284C7', '#16A34A'],
} as const;
/** @deprecated use chartPalette[theme] */
export const chartColors = chartPalette.light;

// ---------------------------------------------------------------------------
// Shape, depth, type, motion, layout
// ---------------------------------------------------------------------------
export const radius = { xs: 6, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, full: 9999 } as const;
/** Cards use radius.md (12px). */
export const cardRadius = radius.md;

/** 4-pt spacing scale (px / dp). */
export const spacing = {
  0: 0, 0.5: 2, 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80,
} as const;

export const shadows = {
  light: {
    card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 4px 12px rgba(16, 24, 40, 0.06)',
    raised: '0 4px 8px rgba(16, 24, 40, 0.06), 0 12px 28px rgba(16, 24, 40, 0.10)',
    overlay: '0 24px 48px rgba(16, 24, 40, 0.18)',
  },
  dark: {
    card: '0 1px 2px rgba(0, 0, 0, 0.30), 0 4px 12px rgba(0, 0, 0, 0.24)',
    raised: '0 4px 8px rgba(0, 0, 0, 0.32), 0 12px 28px rgba(0, 0, 0, 0.36)',
    overlay: '0 24px 48px rgba(0, 0, 0, 0.5)',
  },
} as const;

/** React Native equivalents (iOS shadow + Android elevation). */
export const nativeShadows = {
  card: { shadowColor: '#101828', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  raised: { shadowColor: '#101828', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
} as const;

export const typography = {
  fontFamily: {
    sans: 'Inter',
    // Fallbacks include Indic system fonts so Hindi/Telugu render natively.
    sansStack: "Inter, 'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Telugu', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  // [fontSize, lineHeight] in px
  size: {
    '2xs': [11, 14], xs: [12, 16], sm: [14, 20], base: [16, 24], lg: [18, 28], xl: [20, 28],
    '2xl': [24, 32], '3xl': [30, 38], '4xl': [36, 44],
  },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
  letterSpacing: { tight: -0.2, normal: 0, wide: 0.2, caps: 0.6 },
} as const;

export const motion = {
  duration: { fast: 120, base: 200, slow: 320 },
  easing: { standard: 'cubic-bezier(0.2, 0, 0, 1)', emphasized: 'cubic-bezier(0.3, 0, 0, 1.2)', exit: 'cubic-bezier(0.4, 0, 1, 1)' },
} as const;

export const layout = {
  /** Minimum touch target on mobile (dp) — exceeds the 44/48 platform guidance. */
  minTapTarget: 48,
  sidebarWidth: 264,
  sidebarCollapsedWidth: 72,
  topbarHeight: 64,
  mobileHeaderHeight: 56,
  mobileTabBarHeight: 64,
  contentMaxWidth: 1440,
  gutter: { mobile: 16, tablet: 24, desktop: 32 },
} as const;

export const zIndex = { base: 0, sticky: 10, header: 20, dropdown: 30, overlay: 40, modal: 50, toast: 60 } as const;

export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 } as const;

// ---------------------------------------------------------------------------
// CSS variable bridge (web + NativeWind)
// ---------------------------------------------------------------------------
const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** "#2563EB" → "37 99 235";  "rgba(1,2,3,0.5)" → "1 2 3 / 0.5" */
export function toRgbChannels(color: string): string {
  if (color.startsWith('#')) {
    const hex = color.length === 4 ? color.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : color;
    const n = parseInt(hex.slice(1, 7), 16);
    return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m?.[1]) throw new Error(`Unsupported color: ${color}`);
  const [r, g, b, a] = m[1].split(',').map((x) => x.trim());
  return a !== undefined ? `${r} ${g} ${b} / ${a}` : `${r} ${g} ${b}`;
}

/** Semantic colour keys exposed as CSS variables `--tn-<kebab-key>`. */
export const semanticKeys = Object.keys(lightTheme) as Array<keyof SemanticTheme>;

export function cssVariables(name: ThemeName): Record<string, string> {
  const t = themes[name];
  const vars: Record<string, string> = {};
  for (const key of semanticKeys) {
    // the scrim keeps its alpha and is used as a full colour; everything else is
    // exposed as "r g b" channels so Tailwind opacity modifiers (bg-primary/10) work
    vars[`--tn-${kebab(key)}`] = key === 'overlay' ? t[key] : toRgbChannels(t[key]);
  }
  for (const [tone, v] of Object.entries(kpiTones[name])) {
    vars[`--tn-kpi-${tone}-bg`] = toRgbChannels(v.bg);
    vars[`--tn-kpi-${tone}-fg`] = toRgbChannels(v.fg);
    vars[`--tn-kpi-${tone}-icon`] = toRgbChannels(v.icon);
  }
  chartPalette[name].forEach((c, i) => (vars[`--tn-chart-${i + 1}`] = toRgbChannels(c)));
  vars['--tn-shadow-card'] = shadows[name].card;
  vars['--tn-shadow-raised'] = shadows[name].raised;
  vars['--tn-radius'] = `${radius.md}px`;
  return vars;
}

/**
 * Renders the CSS variable sheet.
 *  - 'web':    :root (light) + .dark class + system preference (next-themes)
 *  - 'native': :root + @media (prefers-color-scheme: dark) — the subset NativeWind understands
 */
export function themeCss(target: 'web' | 'native' = 'web'): string {
  const block = (vars: Record<string, string>, indent = '  ') =>
    Object.entries(vars)
      .map(([k, v]) => `${indent}${k}: ${v};`)
      .join('\n');
  const header = `/* AUTO-GENERATED from packages/ui/src/tokens.ts — run \`pnpm --filter @teamnest/ui gen:css\` */`;
  if (target === 'native') {
    const nativeVars = (n: ThemeName) =>
      Object.fromEntries(Object.entries(cssVariables(n)).filter(([k]) => !k.startsWith('--tn-shadow')));
    return [
      header,
      `:root {\n${block(nativeVars('light'))}\n}`,
      `@media (prefers-color-scheme: dark) {\n  :root {\n${block(nativeVars('dark'), '    ')}\n  }\n}`,
      '',
    ].join('\n\n');
  }
  return [
    header,
    `:root {\n${block(cssVariables('light'))}\n}`,
    `.dark {\n${block(cssVariables('dark'))}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not(.light) {\n${block(cssVariables('dark'), '    ')}\n  }\n}`,
    '',
  ].join('\n\n');
}
