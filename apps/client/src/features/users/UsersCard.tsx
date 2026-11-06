import { ChevronRight, UserRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { UserInfo, useRoles, useUsers } from '@/api/queries';
import { Card } from '@/components/ui';
import { useSession } from '@/features/auth/session.store';
import { useTheme } from '@/theme/ThemeProvider';

export type RoleOption = { value: string; label: string };

/** Profile name: translated for the built-in ones, as stored for profiles created later. */
export function roleLabel(t: (key: 'roles.user') => string, id: string, fallback: string): string {
  const translated = t(`roles.${id}` as 'roles.user');
  return translated === `roles.${id}` ? fallback : translated;
}

export function useRoleOptions(): RoleOption[] {
  const { t } = useTranslation();
  const roles = useRoles(true).data ?? [];
  return roles.map((r) => ({ value: r.id, label: roleLabel(t, r.id, r.name) }));
}

/** List of accounts (RF-08): each row opens the edit form. */
export function UsersList({ onEdit }: { onEdit: (user: UserInfo) => void }) {
  const { colors } = useTheme();
  const users = useUsers(true);
  const roles = useRoleOptions();

  return (
    <Card className="p-0">
      {users.isPending ? <ActivityIndicator color={colors.accent} className="my-6" /> : null}
      {(users.data ?? []).map((user, i) => (
        <UserRow key={user.id} user={user} first={i === 0} role={roles.find((r) => r.value === user.roleId)?.label ?? user.roleId} onPress={() => onEdit(user)} />
      ))}
    </Card>
  );
}

function UserRow({ user, role, first, onPress }: { user: UserInfo; role: string; first: boolean; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const me = useSession((s) => s.user?.id) === user.id;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`flex-row items-center px-4 py-3 active:bg-line ${first ? '' : 'border-t border-line'}`}
    >
      <View className={`h-9 w-9 items-center justify-center rounded-full ${user.disabled ? 'bg-line' : 'bg-accent/15'}`}>
        <UserRound size={17} color={user.disabled ? colors.muted : colors.accent} />
      </View>
      <View className="ml-3 flex-1">
        <Text className={`text-base font-semibold ${user.disabled ? 'text-muted' : 'text-ink'}`} numberOfLines={1}>
          {user.username}
          {me ? <Text className="text-sm font-normal text-muted">{`  (${t('users.you')})`}</Text> : null}
        </Text>
        <Text className="text-xs text-muted" numberOfLines={1}>
          {role} · {t('users.since', { date: new Date(user.createdAt).toLocaleDateString(i18n.language) })}
        </Text>
      </View>
      <View className={`mr-2 rounded-full px-2 py-0.5 ${user.disabled ? 'bg-warning/15' : 'bg-accent/15'}`}>
        <Text className={`text-[11px] font-medium ${user.disabled ? 'text-warning' : 'text-accent'}`}>
          {user.disabled ? t('users.disabled') : t('users.active')}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.muted} />
    </Pressable>
  );
}
