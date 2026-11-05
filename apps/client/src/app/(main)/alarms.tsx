import { useTranslation } from 'react-i18next';
import { useOpenAlarms } from '@/api/queries';
import { TopBar } from '@/components/TopBar';
import { Card, Screen } from '@/components/ui';
import { AlarmList } from '@/features/alarms/NodeAlarms';

/** Open alarms of every node; unacknowledged ones first, newest first. */
export default function AlarmsScreen() {
  const { t } = useTranslation();
  const alarms = (useOpenAlarms().data ?? [])
    .filter((a) => a.state !== 'closed')
    .sort((a, b) => Number(a.ackedAt !== null) - Number(b.ackedAt !== null) || b.raisedAt - a.raisedAt);

  return (
    <Screen inTabs>
      <TopBar title={t('alarmsScreen.title')} subtitle={t('alarmsScreen.subtitle')} />
      <Card>
        <AlarmList alarms={alarms} showNode />
      </Card>
    </Screen>
  );
}
