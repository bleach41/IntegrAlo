import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/features/auth/session.store';
import { useTheme } from '@/theme/ThemeProvider';

/** Screens shown before signing in; a signed-in user goes straight to the main area. */
export default function AuthLayout() {
  const user = useSession((s) => s.user);
  const { colors } = useTheme();
  if (user) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />;
}
