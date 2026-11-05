import { commandPermission, hasPermission } from '@integralo/contract';
import { router, useLocalSearchParams } from 'expo-router';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useLatestTelemetry, useModules, useNodes } from '@/api/queries';
import { HeaderButton } from '@/components/TopBar';
import { Card, Screen } from '@/components/ui';
import { NodeAlarms } from '@/features/alarms/NodeAlarms';
import { useSession } from '@/features/auth/session.store';
import { CommandForm } from '@/features/commands/CommandForm';
import { NodeHeader } from '@/features/nodes/NodeCard';
import { VariablesGrid } from '@/features/nodes/VariablesGrid';
import { NodeTrends } from '@/features/telemetry/NodeTrends';

/**
 * Detail of a node, entirely generated from its module manifest: current values, trend
 * charts, open alarms and the commands the user may send. Commands that change one
 * value are under "Control"; those that change several settings, under "Engineering".
 */
export default function NodeDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const permissions = useSession((s) => s.user?.permissions ?? []);
  const node = useNodes().data?.find((n) => n.id === id && n.approval === 'approved');
  const manifest = useModules().data?.find((m) => m.id === node?.module);
  const latest = useLatestTelemetry(id, !!node).data;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!node) {
    return (
      <Screen>
        <HeaderButton onPress={back}>{t('common.back')}</HeaderButton>
        <Text className="mt-6 text-sm text-muted">{t('detail.notFound')}</Text>
      </Screen>
    );
  }

  const allowed = (manifest?.commands ?? []).filter((c) => hasPermission(permissions, commandPermission(node.module, c.type)));
  const control = allowed.filter((c) => !c.partial);
  const engineering = allowed.filter((c) => c.partial);
  const current = latest?.values ?? {};

  return (
    <Screen>
      <View className="mb-4 self-start">
        <HeaderButton onPress={back}>{t('common.back')}</HeaderButton>
      </View>

      <Card className="mb-4">
        <NodeHeader node={node} />
        <View className="mt-4">
          {latest && manifest ? <VariablesGrid variables={manifest.variables} sample={latest} /> : <Text className="text-sm text-muted">{t('dashboard.noData')}</Text>}
        </View>
      </Card>

      <Section title={t('alarms.title')}>
        <NodeAlarms nodeId={node.id} manifest={manifest} />
      </Section>

      {manifest ? (
        <Section title={t('detail.trend')}>
          <NodeTrends nodeId={node.id} manifest={manifest} />
        </Section>
      ) : null}

      {control.length > 0 ? (
        <Section title={t('detail.control')}>
          {!node.online ? <Text className="mb-3 text-xs text-warning">{t('commands.offline')}</Text> : null}
          {control.map((command) => (
            <CommandForm key={command.type} nodeId={node.id} command={command} current={current} disabled={!node.online} />
          ))}
        </Section>
      ) : null}

      {engineering.length > 0 ? (
        <Section title={t('detail.engineering')}>
          {engineering.map((command) => (
            <CommandForm key={command.type} nodeId={node.id} command={command} current={current} disabled={!node.online} />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mb-4">
      <Text className="mb-4 text-lg font-semibold text-ink">{title}</Text>
      {children}
    </Card>
  );
}
