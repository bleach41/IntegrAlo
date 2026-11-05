import { PERMISSIONS, hasPermission } from '@integralo/contract';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { useModules, useNodes, useOpenAlarms } from '@/api/queries';
import { TopBar } from '@/components/TopBar';
import { Button, Card, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/session.store';
import { NodeCard } from '@/features/nodes/NodeCard';
import { PendingNodeCard } from '@/features/nodes/PendingNodeCard';
import { useTheme } from '@/theme/ThemeProvider';

/** Dashboard: nodes waiting for approval and approved nodes with live readings. */
export default function DashboardScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const permissions = useSession((s) => s.user?.permissions ?? []);
  const nodes = useNodes();
  const modules = useModules();
  const alarms = useOpenAlarms();

  const pending = nodes.data?.filter((n) => n.approval === 'pending') ?? [];
  const approved = nodes.data?.filter((n) => n.approval === 'approved') ?? [];
  const manifestOf = (moduleId: string) => modules.data?.find((m) => m.id === moduleId);
  const alarmsOf = (nodeId: string) => alarms.data?.filter((a) => a.nodeId === nodeId && a.state !== 'closed').length ?? 0;

  return (
    <Screen>
      <TopBar title={t('dashboard.title')} action={{ label: t('dashboard.settings'), onPress: () => router.push('/settings') }} />

      {nodes.isPending ? <ActivityIndicator color={colors.accent} className="mt-10" /> : null}

      {nodes.isError ? (
        <Card>
          <Text className="text-sm text-danger">{t('dashboard.loadError')}</Text>
          <Button label={t('common.retry')} onPress={() => void nodes.refetch()} variant="ghost" />
        </Card>
      ) : null}

      {pending.length > 0 ? (
        <View className="mb-2">
          <Text className="mb-1 text-sm font-semibold uppercase tracking-wide text-warning">{t('dashboard.pending')}</Text>
          <Text className="mb-3 text-xs text-muted">{t('dashboard.pendingHint')}</Text>
          {pending.map((node) => (
            <PendingNodeCard key={node.id} node={node} canApprove={hasPermission(permissions, PERMISSIONS.nodesApprove)} />
          ))}
        </View>
      ) : null}

      {nodes.isSuccess && approved.length === 0 ? (
        <Card>
          <Text className="text-sm leading-5 text-muted">{t('dashboard.empty')}</Text>
        </Card>
      ) : null}

      {approved.map((node) => (
        <NodeCard key={node.id} node={node} manifest={manifestOf(node.module)} alarmCount={alarmsOf(node.id)} />
      ))}
    </Screen>
  );
}
