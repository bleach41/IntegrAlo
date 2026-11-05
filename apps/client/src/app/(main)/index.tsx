import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Brand, Button, Card, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/session.store';
import { roleName, t } from '@/i18n/es';

/** Temporary home: confirms the session; the node dashboard comes next. */
export default function HomeScreen() {
  const user = useSession((s) => s.user);
  const serverUrl = useSession((s) => s.serverUrl);
  const logout = useSession((s) => s.logout);

  async function signOut() {
    await logout();
    router.replace('/login');
  }

  return (
    <Screen centered>
      <Brand />
      <Card>
        <Text className="text-xl font-semibold text-ink">{t('home.greeting', { name: user?.username ?? '' })}</Text>
        <View className="mt-2 self-start rounded-full bg-accent/15 px-3 py-1">
          <Text className="text-xs font-semibold text-accent">{user ? roleName(user.roleId) : ''}</Text>
        </View>
        <Text className="mt-4 text-sm leading-5 text-muted">{t('home.nextSteps')}</Text>
        <Text className="mt-2 text-xs text-muted">{t('home.server', { url: serverUrl ?? '' })}</Text>
        <Button label={t('common.signOut')} onPress={signOut} variant="ghost" />
      </Card>
    </Screen>
  );
}
