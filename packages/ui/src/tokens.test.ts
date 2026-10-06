import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { darkTheme, kpiTones, lightTheme, mix, themeCss, toRgbChannels, type SemanticTheme } from './tokens';

function luminance(hex: string) {
  const [r, g, b] = toRgbChannels(hex).split(' ').map(Number).map((c) => {
    const s = c! / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const AA = 4.5;
const pairs: Array<[keyof SemanticTheme, keyof SemanticTheme]> = [
  ['text', 'background'], ['text', 'surface'], ['text', 'surfaceMuted'],
  ['textMuted', 'surface'], ['textMuted', 'background'],
  ['primaryText', 'surface'], ['primaryText', 'primarySoft'],
  ['onPrimary', 'primary'], ['onHeader', 'header'],
  ['accentText', 'surface'], ['accentText', 'accentSoft'], ['onAccent', 'accent'],
  ['highlightText', 'surface'], ['highlightText', 'highlightSoft'], ['onHighlight', 'highlight'],
  ['success', 'successSoft'], ['warning', 'warningSoft'], ['danger', 'dangerSoft'], ['info', 'infoSoft'],
  ['onDanger', 'danger'],
];

describe.each([['light', lightTheme], ['dark', darkTheme]] as const)('%s theme contrast (WCAG AA)', (_, theme) => {
  it.each(pairs)('%s on %s ≥ 4.5:1', (fg, bg) => {
    expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(AA);
  });

  it('KPI tile text is readable on its pastel', () => {
    const name = theme === lightTheme ? 'light' : 'dark';
    for (const tone of Object.values(kpiTones[name])) expect(contrast(tone.fg, tone.bg)).toBeGreaterThanOrEqual(AA);
  });
});

describe('brand', () => {
  it('uses the specified brand colours', () => {
    expect(lightTheme.primary).toBe('#2563EB');
    expect(lightTheme.accent).toBe('#14B8A6');
    expect(lightTheme.highlight).toBe('#F97316');
    expect(lightTheme.background).toBe('#F4F6FA');
  });

  it('mix() blends hex colours', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(toRgbChannels('#2563EB')).toBe('37 99 235');
  });

  it.each([['theme.css', 'web'], ['theme.native.css', 'native']] as const)(
    '%s is in sync with tokens (run `pnpm --filter @teamnest/ui gen:css`)',
    (file, target) => {
      const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), file), 'utf8');
      expect(css).toBe(themeCss(target));
    },
  );
});
