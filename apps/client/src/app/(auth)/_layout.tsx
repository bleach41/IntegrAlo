import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/features/auth/session.store';

/** Screens shown before signing in; a signed-in user goes straight to the main area. */
export default function AuthLayout() {
  const user = useSession((s) => s.user);
  if (user) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0b1120' } }} />;
}
