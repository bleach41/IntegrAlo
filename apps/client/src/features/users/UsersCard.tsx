import { UserPlus, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';
import { ApiError } from '@/api/client';
import { UserInfo, useCreateUser, useRoles, useUpdateUser, useUsers } from '@/api/queries';
import { Card, ErrorText, Field, Segmented, SmallButton } from '@/components/ui';
import { useSession } from '@/features/auth/session.store';
import { validateNewAccount } from '@/features/auth/errors';
import { useTheme } from '@/theme/ThemeProvider';

/** User management (RF-08): create accounts, change profile, disable, reset password. */
export function UsersCard() {
  const { t } = useTranslation();
  const users = useUsers(true).data ?? [];
  const roles = useRoles(true).data ?? [];
  const roleOptions = roles.map((r) => ({ value: r.id, label: roleLabel(t, r.id, r.name) }));

  return (
    <Card>
      {users.map((user) => (
        <UserRow key={user.id} user={user} roleOptions={roleOptions} />
      ))}
      <CreateUserForm roleOptions={roleOptions} />
    </Card>
  );
}

type RoleOption = { value: string; label: string };

function roleLabel(t: (key: 'roles.user') => string, id: string, fallback: string): string {
  const translated = t(`roles.${id}` as 'roles.user');
  return translated === `roles.${id}` ? fallback : translated;
}

function UserRow({ user, roleOptions }: { user: UserInfo; roleOptions: RoleOption[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const me = useSession((s) => s.user?.id) === user.id;
  const update = useUpdateUser();
  const [password, setPassword] = useState('');

  return (
    <View className={`mb-3 rounded-xl border border-line p-3 ${user.disabled ? 'opacity-60' : ''}`}>
      <View className="mb-3 flex-row items-center">
        <UserRound size={16} color={colors.muted} />
        <Text className="ml-2 flex-1 text-base font-semibold text-ink">
          {user.username}
          {me ? <Text className="font-normal text-muted">{`  (${t('users.you')})`}</Text> : null}
        </Text>
        {user.disabled ? <Text className="text-xs font-medium text-warning">{t('users.disabled')}</Text> : null}
      </View>
      {/* The server refuses changing one's own role or disabling oneself; the controls are hidden too. */}
      {!me ? (
        <>
          <Segmented value={user.roleId} options={roleOptions} onChange={(roleId) => update.mutate({ id: user.id, changes: { roleId } })} />
          <View className="mt-3 flex-row items-center">
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t('users.resetPassword')}
              placeholderTextColor={colors.muted}
              secureTextEntry
              className="mr-2 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink"
            />
            <SmallButton
              label={t('users.setPassword')}
              busy={update.isPending && update.variables?.changes.password !== undefined}
              onPress={() => password.length >= 8 && update.mutate({ id: user.id, changes: { password } }, { onSuccess: () => setPassword('') })}
            />
          </View>
          <Pressable onPress={() => update.mutate({ id: user.id, changes: { disabled: !user.disabled } })} className="mt-3 self-start active:opacity-60">
            <Text className={`text-xs font-medium ${user.disabled ? 'text-accent' : 'text-danger'}`}>
              {user.disabled ? t('users.enable') : t('users.disable')}
            </Text>
          </Pressable>
          {update.isError ? <Text className="mt-2 text-xs text-danger">{t('users.failed')}</Text> : null}
          {update.isSuccess ? <Text className="mt-2 text-xs text-accent">{t('users.updated')}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

function CreateUserForm({ roleOptions }: { roleOptions: RoleOption[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const create = useCreateUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('user');
  const [error, setError] = useState<Parameters<typeof ErrorText>[0]['message']>(null);

  function submit() {
    const invalid = validateNewAccount(username, password, password);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    create.mutate(
      { username, password, roleId },
      {
        onSuccess: () => {
          setUsername('');
          setPassword('');
        },
        // 409 (existing user) has its own message below; anything else is unexpected.
        onError: (err) => setError(err instanceof ApiError && err.status === 409 ? null : { key: 'common.unexpectedError' }),
      },
    );
  }

  return (
    <View className="mt-2 rounded-xl border border-dashed border-line p-3">
      <Text className="mb-3 text-sm font-semibold text-ink">{t('users.create')}</Text>
      <ErrorText message={error} />
      {create.isError && create.error instanceof ApiError && create.error.status === 409 ? (
        <Text className="mb-3 text-xs text-danger">{t('users.exists')}</Text>
      ) : null}
      <Field label={t('users.username')} value={username} onChangeText={setUsername} />
      <Field label={t('users.password')} value={password} onChangeText={setPassword} secureTextEntry />
      <Text className="mb-1.5 text-sm font-medium text-ink">{t('users.role')}</Text>
      <Segmented value={roleId} options={roleOptions} onChange={setRoleId} />
      <View className="mt-3 flex-row items-center justify-end">
        {create.isSuccess ? <Text className="mr-3 text-xs text-accent">{t('users.created')}</Text> : null}
        <SmallButton label={t('users.create')} busy={create.isPending} onPress={submit} icon={<UserPlus size={14} color={colors.accent} />} />
      </View>
    </View>
  );
}
