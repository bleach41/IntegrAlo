import '../../global.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSession } from '@/features/auth/session.store';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const status = useSession((s) => s.status);
  const hydrate = useSession((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        {status === 'loading' ? (
          <View className="flex-1 items-center justify-center bg-canvas">
            <ActivityIndicator color="#38bdf8" size="large" />
          </View>
        ) : (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0b1120' } }} />
        )}
        <StatusBar style="light" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
