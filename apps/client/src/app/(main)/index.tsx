import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Brand, Button, Card, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/session.store';
import { PreferencesCard } from '@/features/preferences/PreferencesCard';

/** Temporary home: confirms the session; the node dashboard comes next. */
export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const user = useSession((s) => s.user);
  const serverUrl = useSession((s) => s.serverUrl);
  const logout = useSession((s) => s.logout);

  async function signOut() {
    await logout();
    router.replace('/login');
  }

  // Custom roles created later have no translation: their id is shown instead.
  const roleKey = `roles.${user?.roleId ?? ''}`;
  const role = i18n.exists(roleKey) ? t(roleKey as 'roles.user') : (user?.roleId ?? '');

  return (
    <Screen centered>
      <Brand />
      <Card>
        <Text className="text-xl font-semibold text-ink">{t('home.greeting', { name: user?.username ?? '' })}</Text>
        <View className="mt-2 self-start rounded-full bg-accent/15 px-3 py-1">
          <Text className="text-xs font-semibold text-accent">{role}</Text>
        </View>
        <Text className="mt-4 text-sm leading-5 text-muted">{t('home.nextSteps')}</Text>
        <Text className="mt-2 text-xs text-muted">{t('connect.current', { url: serverUrl ?? '' })}</Text>
        <Button label={t('common.signOut')} onPress={signOut} variant="ghost" />
      </Card>
      <PreferencesCard />
    </Screen>
  );
}
