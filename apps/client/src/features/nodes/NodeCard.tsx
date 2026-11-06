import { localize, type ModuleManifest, type NodeInfo } from '@integralo/contract';
import { router } from 'expo-router';
import { BellRing, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useLatestTelemetry } from '@/api/queries';
import { moduleViews } from '@/modules/registry';
import { useTheme } from '@/theme/ThemeProvider';
import { GenericSummary } from './GenericSummary';
import { ModuleIcon } from './ModuleIcon';

/**
 * Card of an approved node: module icon, name and status, a summary (module view, or the
 * generic one built from the manifest) and its open alarms. Tapping it opens the detail.
 * An offline node is dimmed: what it shows is its last reading, not the present.
 */
export function NodeCard({ node, manifest, alarmCount }: { node: NodeInfo; manifest?: ModuleManifest; alarmCount: number }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const latest = useLatestTelemetry(node.id, true).data;
  const Summary = (manifest && moduleViews[manifest.id]?.Summary) ?? GenericSummary;

  return (
    <Pressable
      onPress={() => router.push(`/nodes/${node.id}`)}
      accessibilityRole="button"
      className={`h-full rounded-2xl border bg-surface p-5 active:opacity-80 ${alarmCount > 0 ? 'border-danger/50' : 'border-line'}`}
    >
      <NodeHeader node={node} manifest={manifest} />
      <View className={`my-4 min-h-24 justify-center ${node.online ? '' : 'opacity-40'}`}>
        {latest && manifest ? (
          <Summary manifest={manifest} sample={latest} />
        ) : (
          <Text className="text-center text-sm text-muted">{t('dashboard.noData')}</Text>
        )}
      </View>
      <View className="flex-row items-center justify-between">
        {alarmCount > 0 ? (
          <View className="flex-row items-center rounded-full bg-danger/15 px-2.5 py-1">
            <BellRing size={13} color={colors.danger} />
            <Text className="ml-1.5 text-xs font-semibold text-danger">{t('dashboard.alarms', { count: alarmCount })}</Text>
          </View>
        ) : (
          <Text className="text-xs text-muted">
            {latest
              ? t(node.online ? 'dashboard.updatedAt' : 'dashboard.lastReading', { time: new Date(latest.receivedAt).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' }) })
              : ''}
          </Text>
        )}
        <ChevronRight size={18} color={colors.muted} />
      </View>
    </Pressable>
  );
}

/** Icon, name (or id) and, below, the kind of module and the id: "Temperatura · sim-1bde04". */
export function NodeHeader({ node, manifest }: { node: NodeInfo; manifest?: ModuleManifest }) {
  const { i18n } = useTranslation();
  const kind = localize(manifest?.label, i18n.language, node.module);
  return (
    <View className="flex-row items-center justify-between">
      <ModuleIcon name={manifest?.icon} muted={!node.online} />
      <View className="flex-1 px-3">
        <Text className={`text-lg font-semibold ${node.online ? 'text-ink' : 'text-muted'}`} numberOfLines={1}>
          {node.name ?? kind}
        </Text>
        <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
          {node.name ? `${kind} · ` : ''}
          {node.id} · {node.fw}
        </Text>
      </View>
      <StatusBadge online={node.online} />
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
