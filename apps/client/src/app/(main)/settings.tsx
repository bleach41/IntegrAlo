import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { HeaderButton } from '@/components/TopBar';
import { Button, Card, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/session.store';
import { PreferencesCard } from '@/features/preferences/PreferencesCard';

export default function SettingsScreen() {
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
    <Screen>
      <View className="mb-6 flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-ink">{t('settings.title')}</Text>
        <HeaderButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>{t('common.back')}</HeaderButton>
      </View>

      <Card>
        <Text className="mb-3 text-sm font-medium text-muted">{t('settings.account')}</Text>
        <Text className="text-xl font-semibold text-ink">{t('home.greeting', { name: user?.username ?? '' })}</Text>
        <View className="mt-2 self-start rounded-full bg-accent/15 px-3 py-1">
          <Text className="text-xs font-semibold text-accent">{role}</Text>
        </View>
        <Text className="mt-4 text-xs text-muted">{t('connect.current', { url: serverUrl ?? '' })}</Text>
        <Button label={t('common.signOut')} onPress={signOut} variant="ghost" />
      </Card>

      <PreferencesCard />
    </Screen>
  );
}
