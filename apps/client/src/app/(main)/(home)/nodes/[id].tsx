import { PERMISSIONS, commandPermission, hasPermission } from '@integralo/contract';
import { router, useLocalSearchParams } from 'expo-router';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useLatestTelemetry, useModules, useNodes } from '@/api/queries';
import { BackButton } from '@/components/TopBar';
import { Card, Screen } from '@/components/ui';
import { AlarmConfigCard } from '@/features/alarms/AlarmConfigCard';
import { NodeAlarms } from '@/features/alarms/NodeAlarms';
import { useSession } from '@/features/auth/session.store';
import { CommandForm } from '@/features/commands/CommandForm';
import { GenericSummary } from '@/features/nodes/GenericSummary';
import { NodeHeader } from '@/features/nodes/NodeCard';
import { VariablesGrid } from '@/features/nodes/VariablesGrid';
import { NodeTrends } from '@/features/telemetry/NodeTrends';
import { NodeSynoptic } from '@/features/visual/NodeSynoptic';
import { moduleViews } from '@/modules/registry';
import type { ModuleManifest } from '@integralo/contract';

/** A synoptic exists if the module has its own, or its summary variable declares a display range. */
function hasSynoptic(manifest: ModuleManifest): boolean {
  if (moduleViews[manifest.id]?.Visual) return true;
  const key = manifest.summary?.primary ?? manifest.variables[0].key;
  const variable = manifest.variables.find((v) => v.key === key);
  return variable?.type === 'number' && !!variable.displayRange;
}

/**
 * Detail of a node, entirely generated from its module manifest (plus the optional module
 * summary view): current values, trend charts, open alarms and the commands the user may
 * send. Commands that change one value are under "Control"; those that change several
 * settings, under "Engineering". On wide screens monitoring and commands sit side by side.
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
      <Screen inTabs>
        <BackButton label={t('common.back')} onPress={back} />
        <Text className="mt-2 text-sm text-muted">{t('detail.notFound')}</Text>
      </Screen>
    );
  }

  const allowed = (manifest?.commands ?? []).filter((c) => hasPermission(permissions, commandPermission(node.module, c.type)));
  const control = allowed.filter((c) => !c.partial);
  const engineering = allowed.filter((c) => c.partial);
  const current = latest?.values ?? {};
  const Summary = (manifest && moduleViews[manifest.id]?.Summary) ?? GenericSummary;

  return (
    <Screen wide inTabs>
      <BackButton label={t('common.back')} onPress={back} />

      <View className="lg:flex-row lg:items-start">
        <View className="lg:mr-4 lg:flex-[3]">
          <Card className="mb-4">
            <NodeHeader node={node} />
            {latest && manifest ? (
              <>
                <View className="my-4">
                  {hasSynoptic(manifest) ? (
                    <NodeSynoptic node={node} manifest={manifest} sample={latest} />
                  ) : (
                    <Summary manifest={manifest} sample={latest} />
                  )}
                </View>
                <VariablesGrid
                  variables={manifest.variables}
                  sample={latest}
                  exclude={manifest.summary ? [manifest.summary.primary, ...manifest.summary.secondary] : []}
                />
              </>
            ) : (
              <Text className="mt-4 text-sm text-muted">{t('dashboard.noData')}</Text>
            )}
          </Card>

          <Section title={t('alarms.title')}>
            <NodeAlarms nodeId={node.id} />
          </Section>

          {manifest ? (
            <Section title={t('detail.trend')}>
              <NodeTrends nodeId={node.id} manifest={manifest} />
            </Section>
          ) : null}
        </View>

        <View className="lg:flex-[2]">
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

          {manifest && hasPermission(permissions, PERMISSIONS.alarmsConfigure) ? (
            <Section title={t('alarmConfig.title')}>
              <AlarmConfigCard nodeId={node.id} manifest={manifest} />
            </Section>
          ) : null}
        </View>
      </View>
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
