import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { ApiError } from '@/api/client';
import { UserInfo, useCreateUser, useUpdateUser } from '@/api/queries';
import { FormModal } from '@/components/FormModal';
import { ErrorText, Field, Segmented, SmallButton } from '@/components/ui';
import { useSession } from '@/features/auth/session.store';
import { Message, validateNewAccount } from '@/features/auth/errors';
import { useRoleOptions } from './UsersCard';

const MIN_PASSWORD = 8;

/**
 * One form for both creating and editing an account. Editing sends only what changed; the
 * username cannot change (the audit log refers to it), and one's own account cannot change
 * its profile or be disabled (the core refuses it as well).
 */
export function UserFormModal({ user, visible, onClose }: { user: UserInfo | null; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const roles = useRoleOptions();
  const myId = useSession((s) => s.user?.id);
  const create = useCreateUser();
  const update = useUpdateUser();
  const editing = user !== null;
  const me = editing && user.id === myId;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('user');
  const [active, setActive] = useState<'yes' | 'no'>('yes');
  const [error, setError] = useState<Message | null>(null);

  // Every opening starts from the account being edited, or from an empty form.
  useEffect(() => {
    if (!visible) return;
    setUsername(user?.username ?? '');
    setPassword('');
    setRoleId(user?.roleId ?? 'user');
    setActive(user?.disabled ? 'no' : 'yes');
    setError(null);
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, user]);

  const failed = (err: unknown) =>
    setError(err instanceof ApiError && err.status === 409 ? { key: 'users.exists' } : { key: 'users.failed' });

  function save() {
    if (!editing) {
      const invalid = validateNewAccount(username.trim(), password, password);
      if (invalid) return setError(invalid);
      create.mutate({ username: username.trim(), password, roleId }, { onSuccess: onClose, onError: failed });
      return;
    }
    if (password !== '' && password.length < MIN_PASSWORD) return setError({ key: 'setup.tooShort', params: { min: MIN_PASSWORD } });
    const changes: { roleId?: string; disabled?: boolean; password?: string } = {};
    if (!me && roleId !== user.roleId) changes.roleId = roleId;
    if (!me && (active === 'no') !== user.disabled) changes.disabled = active === 'no';
    if (password !== '') changes.password = password;
    if (Object.keys(changes).length === 0) return onClose();
    update.mutate({ id: user.id, changes }, { onSuccess: onClose, onError: failed });
  }

  return (
    <FormModal
      visible={visible}
      title={editing ? t('users.editTitle', { name: user.username }) : t('users.newTitle')}
      onClose={onClose}
      footer={
        <>
          <SmallButton label={t('users.cancel')} onPress={onClose} />
          <View className="ml-2">
            <SmallButton primary label={editing ? t('users.save') : t('users.create')} busy={create.isPending || update.isPending} onPress={save} />
          </View>
        </>
      }
    >
      <ErrorText message={error} />
      {editing ? null : <Field label={t('users.username')} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />}
      <Field
        label={editing ? t('users.newPassword') : t('users.password')}
        hint={editing ? t('users.newPasswordHint') : t('setup.tooShort', { min: MIN_PASSWORD })}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <Text className="mb-1.5 text-sm font-medium text-ink">{t('users.role')}</Text>
      <Segmented value={roleId} options={roles} onChange={setRoleId} disabled={me} />

      {editing ? (
        <>
          <Text className="mb-1.5 mt-4 text-sm font-medium text-ink">{t('users.status')}</Text>
          <Segmented
            value={active}
            options={[
              { value: 'yes', label: t('users.active') },
              { value: 'no', label: t('users.disabled') },
            ]}
            onChange={setActive}
            disabled={me}
          />
          <Text className="mb-4 mt-2 text-xs leading-4 text-muted">{me ? t('users.selfHint') : t('users.disableHint')}</Text>
        </>
      ) : (
        <View className="mb-4" />
      )}
    </FormModal>
  );
}
