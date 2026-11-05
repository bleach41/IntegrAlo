/**
 * Single source of the interface colors, as semantic tokens ("surface", "accent"…)
 * rather than raw colors. Screens only use the tokens, so:
 * - light and dark themes are two value sets of the same tokens;
 * - changing the brand color is a change in this file only.
 * Values are RGB channels ("r g b") so Tailwind opacity modifiers keep working (bg-danger/10).
 */
export type ColorScheme = 'light' | 'dark';

export const TOKENS = ['canvas', 'surface', 'line', 'ink', 'muted', 'accent', 'accent-strong', 'on-accent', 'danger', 'warning'] as const;
export type Token = (typeof TOKENS)[number];

type Rgb = readonly [number, number, number];

export const palette: Record<ColorScheme, Record<Token, Rgb>> = {
  dark: {
    canvas: [10, 17, 14], // app background
    surface: [17, 28, 23], // cards and panels
    line: [31, 48, 41], // borders and dividers
    ink: [231, 242, 236], // main text
    muted: [138, 163, 152], // secondary text
    accent: [52, 211, 153], // brand green (emerald 400)
    'accent-strong': [16, 185, 129], // buttons (emerald 500)
    'on-accent': [4, 18, 12], // text over accent-strong
    danger: [248, 113, 113],
    warning: [251, 191, 36],
  },
  light: {
    canvas: [244, 248, 246],
    surface: [255, 255, 255],
    line: [215, 227, 221],
    ink: [15, 29, 23],
    muted: [91, 112, 103],
    accent: [5, 150, 105], // emerald 600
    'accent-strong': [4, 120, 87], // emerald 700
    'on-accent': [255, 255, 255],
    danger: [220, 38, 38],
    warning: [217, 119, 6],
  },
};

export const cssVariable = (token: Token) => `--color-${token}`;

/** CSS variables of a scheme, to be applied with NativeWind's vars(). */
export function schemeVariables(scheme: ColorScheme): Record<string, string> {
  return Object.fromEntries(TOKENS.map((token) => [cssVariable(token), palette[scheme][token].join(' ')]));
}

/** Hex colors of a scheme, for props that do not accept classes (ActivityIndicator, placeholders…). */
export function schemeHex(scheme: ColorScheme): Record<Token, string> {
  const hex = (rgb: Rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  return Object.fromEntries(TOKENS.map((token) => [token, hex(palette[scheme][token])])) as Record<Token, string>;
}
