import { PERMISSIONS, hasPermission } from '@integralo/contract';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { useModules, useNodes, useOpenAlarms } from '@/api/queries';
import { TopBar } from '@/components/TopBar';
import { Button, Card, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/session.store';
import { NodeCard } from '@/features/nodes/NodeCard';
import { PendingNodeCard } from '@/features/nodes/PendingNodeCard';
import { useTheme } from '@/theme/ThemeProvider';

/** Grid cell: one column on phones, two on tablets, three on wide screens. */
const CELL = 'w-full p-2 md:w-1/2 xl:w-1/3';

/** Dashboard: nodes waiting for approval and approved nodes with live summaries. */
export default function DashboardScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const permissions = useSession((s) => s.user?.permissions ?? []);
  const nodes = useNodes();
  const modules = useModules();
  const alarms = useOpenAlarms();

  const pending = nodes.data?.filter((n) => n.approval === 'pending') ?? [];
  // Online nodes first; the offline ones (often old boards) go to the end.
  const approved = (nodes.data?.filter((n) => n.approval === 'approved') ?? []).sort((a, b) => Number(b.online) - Number(a.online));
  const manifestOf = (moduleId: string) => modules.data?.find((m) => m.id === moduleId);
  const alarmsOf = (nodeId: string) => alarms.data?.filter((a) => a.nodeId === nodeId && a.state !== 'closed').length ?? 0;

  return (
    <Screen wide inTabs>
      <TopBar title={t('dashboard.title')} />

      {nodes.isPending ? <ActivityIndicator color={colors.accent} className="mt-10" /> : null}

      {nodes.isError ? (
        <Card>
          <Text className="text-sm text-danger">{t('dashboard.loadError')}</Text>
          <Button label={t('common.retry')} onPress={() => void nodes.refetch()} variant="ghost" />
        </Card>
      ) : null}

      {pending.length > 0 ? (
        <View className="mb-6">
          <Text className="mb-1 text-sm font-semibold uppercase tracking-wide text-warning">{t('dashboard.pending')}</Text>
          <Text className="mb-1 text-xs text-muted">{t('dashboard.pendingHint')}</Text>
          <View className="-mx-2 flex-row flex-wrap">
            {pending.map((node) => (
              <View key={node.id} className={CELL}>
                <PendingNodeCard node={node} canApprove={hasPermission(permissions, PERMISSIONS.nodesApprove)} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {nodes.isSuccess && approved.length === 0 ? (
        <Card>
          <Text className="text-sm leading-5 text-muted">{t('dashboard.empty')}</Text>
        </Card>
      ) : null}

      <View className="-mx-2 flex-row flex-wrap">
        {approved.map((node) => (
          <View key={node.id} className={CELL}>
            <NodeCard node={node} manifest={manifestOf(node.module)} alarmCount={alarmsOf(node.id)} />
          </View>
        ))}
      </View>
    </Screen>
  );
}
