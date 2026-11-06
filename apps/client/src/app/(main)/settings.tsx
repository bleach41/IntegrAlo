import { router } from 'expo-router';
import { LogOut, Server, UserRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { TopBar } from '@/components/TopBar';
import { Button, Card, Screen } from '@/components/ui';
import { PERMISSIONS, hasPermission } from '@integralo/contract';
import { useSession } from '@/features/auth/session.store';
import { PreferencesCard } from '@/features/preferences/PreferencesCard';
import { NodeAccessCard } from '@/features/system/NodeAccessCard';
import { UsersCard } from '@/features/users/UsersCard';
import { useTheme } from '@/theme/ThemeProvider';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
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
    <Screen inTabs>
      <TopBar title={t('settings.title')} />

      <Card>
        <Text className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">{t('settings.account')}</Text>
        <View className="flex-row items-center">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-accent/15">
            <UserRound size={22} color={colors.accent} />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-lg font-semibold text-ink">{user?.username}</Text>
            <Text className="text-xs font-medium text-accent">{role}</Text>
          </View>
        </View>
        <View className="mt-4 flex-row items-center">
          <Server size={14} color={colors.muted} />
          <Text className="ml-2 text-xs text-muted">{t('connect.current', { url: serverUrl ?? '' })}</Text>
        </View>
        <View className="mt-2 flex-row items-center justify-center">
          <LogOut size={16} color={colors.accent} />
          <Button label={t('common.signOut')} onPress={signOut} variant="ghost" />
        </View>
      </Card>

      <PreferencesCard />
      {/* Engineering sections, shown only with their permission (the core enforces it too). */}
      {hasPermission(user?.permissions ?? [], PERMISSIONS.nodeAccessRead) ? <NodeAccessCard /> : null}
      {hasPermission(user?.permissions ?? [], PERMISSIONS.usersManage) ? <UsersCard /> : null}
    </Screen>
  );
}
