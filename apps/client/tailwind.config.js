/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Interface palette in one place, so the look can be changed without touching screens.
      colors: {
        canvas: '#0b1120',
        surface: '#111a2e',
        line: '#1f2b45',
        ink: '#e6edf7',
        muted: '#8b9bb4',
        accent: { DEFAULT: '#38bdf8', strong: '#0ea5e9' },
        danger: '#f87171',
      },
    },
  },
  plugins: [],
};
