import { UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { UserInfo } from '@/api/queries';
import { TopBar } from '@/components/TopBar';
import { Screen, SmallButton } from '@/components/ui';
import { UserFormModal } from '@/features/users/UserFormModal';
import { UsersList } from '@/features/users/UsersCard';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * User management (RF-08), engineering only (the core enforces it too): the list of
 * accounts, and one modal form to create a new one or edit the one tapped.
 */
export default function UsersScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserInfo | null>(null);

  return (
    <Screen inTabs>
      <TopBar title={t('users.title')} subtitle={t('users.subtitle')} />
      <View className="mb-3 flex-row justify-end">
        <SmallButton
          label={t('users.new')}
          icon={<UserPlus size={14} color={colors.accent} />}
          onPress={() => {
            setEditing(null);
            setOpen(true);
          }}
        />
      </View>
      <UsersList
        onEdit={(user) => {
          setEditing(user);
          setOpen(true);
        }}
      />
      <UserFormModal user={editing} visible={open} onClose={() => setOpen(false)} />
    </Screen>
  );
}
