/** @type {import('tailwindcss').Config} */
// The shared preset is TypeScript; Tailwind's config loader (jiti) handles it.
const preset = require('@teamnest/ui/tailwind-preset').default;

module.exports = {
  presets: [require('nativewind/preset'), preset],
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // React Native needs one family per weight.
      fontFamily: {
        inter: ['Inter_400Regular'],
        'inter-medium': ['Inter_500Medium'],
        'inter-semibold': ['Inter_600SemiBold'],
        'inter-bold': ['Inter_700Bold'],
      },
    },
  },
};
