import type { ModuleManifest, NodeInfo } from '@integralo/contract';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useLatestTelemetry } from '@/api/queries';
import { Card } from '@/components/ui';
import { VariablesGrid } from './VariablesGrid';

/**
 * Card of an approved node. Its content comes from the module manifest, so it works for
 * any module (temperature, tank level…) without specific code. Tapping it opens the detail.
 */
export function NodeCard({ node, manifest, alarmCount }: { node: NodeInfo; manifest?: ModuleManifest; alarmCount: number }) {
  const { t } = useTranslation();
  const latest = useLatestTelemetry(node.id, true).data;

  return (
    <Pressable onPress={() => router.push(`/nodes/${node.id}`)} accessibilityRole="button" className="active:opacity-80">
      <Card className="mb-4">
        <NodeHeader node={node} />
        {alarmCount > 0 ? <AlarmBadge count={alarmCount} /> : null}
        <View className="mt-4">
          {latest ? (
            <VariablesGrid variables={manifest?.variables ?? []} sample={latest} />
          ) : (
            <Text className="text-sm text-muted">{t('dashboard.noData')}</Text>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

export function NodeHeader({ node }: { node: NodeInfo }) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-start justify-between">
      <View className="flex-1 pr-3">
        <Text className="text-lg font-semibold text-ink">{node.name ?? node.id}</Text>
        <Text className="mt-0.5 text-xs text-muted">
          {node.name ? `${node.id} · ` : ''}
          {t('dashboard.firmware', { fw: node.fw })}
        </Text>
      </View>
      <StatusBadge online={node.online} />
    </View>
  );
}

function AlarmBadge({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <View className="mt-3 self-start rounded-full bg-danger/15 px-3 py-1">
      <Text className="text-xs font-semibold text-danger">{t('dashboard.alarms', { count })}</Text>
    </View>
  );
}

export function StatusBadge({ online }: { online: boolean }) {
  const { t } = useTranslation();
  return (
    <View className={`flex-row items-center rounded-full px-2.5 py-1 ${online ? 'bg-accent/15' : 'bg-line'}`}>
      <View className={`mr-1.5 h-2 w-2 rounded-full ${online ? 'bg-accent' : 'bg-muted'}`} />
      <Text className={`text-xs font-medium ${online ? 'text-accent' : 'text-muted'}`}>
        {online ? t('dashboard.online') : t('dashboard.offline')}
      </Text>
    </View>
  );
}
