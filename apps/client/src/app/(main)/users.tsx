import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Screen } from '@/components/ui';
import { UsersCard } from '@/features/users/UsersCard';

/** User management (RF-08) as its own tab, engineering only (the core enforces it too). */
export default function UsersScreen() {
  const { t } = useTranslation();
  return (
    <Screen inTabs>
      <TopBar title={t('users.title')} subtitle={t('users.subtitle')} />
      <UsersCard />
    </Screen>
  );
}
