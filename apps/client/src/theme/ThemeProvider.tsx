import { vars } from 'nativewind';
import { ReactNode, createContext, useContext, useMemo } from 'react';
import { View, useColorScheme as useSystemColorScheme } from 'react-native';
import { usePreferences } from '@/features/preferences/preferences.store';
import { ColorScheme, Token, schemeHex, schemeVariables } from './palette';

interface ThemeValue {
  scheme: ColorScheme;
  /** Hex values for props that do not accept classes. */
  colors: Record<Token, string>;
}

const variables = { light: vars(schemeVariables('light')), dark: vars(schemeVariables('dark')) };
const hex = { light: schemeHex('light'), dark: schemeHex('dark') };
const ThemeContext = createContext<ThemeValue>({ scheme: 'dark', colors: hex.dark });

/**
 * Resolves the theme (user preference, or the system setting when it is "system") and
 * sets the color variables for the whole tree. Changing theme re-renders nothing but the
 * variables: every component keeps the same classes.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = usePreferences((s) => s.theme);
  const system = useSystemColorScheme();
  const scheme: ColorScheme = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
  const value = useMemo(() => ({ scheme, colors: hex[scheme] }), [scheme]);

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, variables[scheme]]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
