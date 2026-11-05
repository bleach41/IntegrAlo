import '../../global.css';
import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSession } from '@/features/auth/session.store';
import { usePreferences } from '@/features/preferences/preferences.store';
import { resolveLanguage } from '@/i18n';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const loadPreferences = usePreferences((s) => s.load);
  const hydrate = useSession((s) => s.hydrate);

  useEffect(() => {
    void loadPreferences();
    void hydrate();
  }, [loadPreferences, hydrate]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LanguageSync />
          <Navigator />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Applies the language preference (or the device language) to i18next. */
function LanguageSync() {
  const preference = usePreferences((s) => s.language);
  const { i18n } = useTranslation();
  useEffect(() => {
    const language = resolveLanguage(preference);
    if (i18n.language !== language) void i18n.changeLanguage(language);
  }, [preference, i18n]);
  return null;
}

function Navigator() {
  const { scheme, colors } = useTheme();
  // Hooks must run on every render in the same order: read both values before combining them.
  const sessionStatus = useSession((s) => s.status);
  const preferencesLoaded = usePreferences((s) => s.loaded);
  const ready = sessionStatus === 'ready' && preferencesLoaded;

  return (
    <>
      {ready ? (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
      ) : (
        <View className="flex-1 items-center justify-center bg-canvas">
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      )}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </>
  );
}
