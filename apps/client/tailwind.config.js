// Theme colors are CSS variables whose values come from src/theme/palette.ts (light and dark).
// Screens must use these semantic names, never raw colors or `dark:` variants.
const TOKENS = ['canvas', 'surface', 'line', 'ink', 'muted', 'accent', 'accent-strong', 'on-accent', 'danger', 'warning'];
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ...Object.fromEntries(TOKENS.filter((t) => !t.startsWith('accent')).map((t) => [t, token(t)])),
        accent: { DEFAULT: token('accent'), strong: token('accent-strong') },
      },
    },
  },
  plugins: [],
};
