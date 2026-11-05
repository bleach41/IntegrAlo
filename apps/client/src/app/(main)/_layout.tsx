import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/features/auth/session.store';

/** Main area: requires a server, a completed setup and a signed-in user. */
export default function MainLayout() {
  const { serverUrl, needsSetup, user } = useSession();
  if (!serverUrl) return <Redirect href="/connect" />;
  if (needsSetup) return <Redirect href="/setup" />;
  if (!user) return <Redirect href="/login" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0b1120' } }} />;
}
