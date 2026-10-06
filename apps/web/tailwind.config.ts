import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import preset from '@teamnest/ui/tailwind-preset';

export default {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}'],
  // The design-system page renders token classes dynamically.
  safelist: [
    { pattern: /^(bg|text)-kpi-(blue|teal|orange|violet|pink|green|amber|sky)(-fg)?$/ },
    { pattern: /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl)$/ },
    { pattern: /^rounded-(xs|sm|md|lg|xl|2xl)$/ },
  ],
  plugins: [animate],
} satisfies Config;
