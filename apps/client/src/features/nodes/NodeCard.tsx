import { localize, type ModuleManifest, type NodeInfo } from '@integralo/contract';
import { router } from 'expo-router';
import { BellRing, ChevronRight, CloudOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useLatestTelemetry } from '@/api/queries';
import { useRealtimeStatus } from '@/api/realtime';
import { moduleViews } from '@/modules/registry';
import { useTheme } from '@/theme/ThemeProvider';
import { GenericSummary } from './GenericSummary';
import { ModuleIcon } from './ModuleIcon';

/**
 * Card of an approved node: module icon, name and status, a summary (module view, or the
 * generic one built from the manifest) and its open alarms. Tapping it opens the detail.
 * An offline node is dimmed: what it shows is its last reading, not the present. The same when
 * the client has lost the server: nothing is known about the node now (it may be running or
 * not), so it is not called "online" and its values are shown as the last ones received, as a
 * SCADA marks data of doubtful quality instead of hiding it.
 */
export function NodeCard({ node, manifest, alarmCount }: { node: NodeInfo; manifest?: ModuleManifest; alarmCount: number }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const latest = useLatestTelemetry(node.id, true).data;
  const Summary = (manifest && moduleViews[manifest.id]?.Summary) ?? GenericSummary;
  const stale = useRealtimeStatus((s) => s.lost);
  const current = node.online && !stale;

  return (
    <Pressable
      onPress={() => router.push(`/nodes/${node.id}`)}
      accessibilityRole="button"
      className={`rounded-2xl border bg-surface p-4 md:h-full active:opacity-80 ${alarmCount > 0 ? 'border-danger/50' : 'border-line'}`}
    >
      <NodeHeader node={node} manifest={manifest} compact />
      <View className={`my-3 min-h-12 justify-center ${current ? '' : 'opacity-40'}`}>
        {latest && manifest ? (
          <Summary manifest={manifest} sample={latest} compact />
        ) : (
          <Text className="text-sm text-muted">{t('dashboard.noData')}</Text>
        )}
      </View>
      <View className="flex-row items-center justify-between">
        {alarmCount > 0 ? (
          <View className="flex-row items-center rounded-full bg-danger/15 px-2 py-0.5">
            <BellRing size={12} color={colors.danger} />
            <Text className="ml-1 text-[11px] font-semibold text-danger">{t('dashboard.alarms', { count: alarmCount })}</Text>
          </View>
        ) : (
          <Text className="text-[11px] text-muted">
            {latest
              ? t(current ? 'dashboard.updatedAt' : 'dashboard.lastReading', { time: new Date(latest.receivedAt).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' }) })
              : ''}
          </Text>
        )}
        <ChevronRight size={16} color={colors.muted} />
      </View>
    </Pressable>
  );
}

/**
 * Icon, name (or the kind of module) and, below, the kind and the id: "Temperatura · sim-1bde04".
 * Compact (dashboard cards): smaller, and without the firmware version.
 */
export function NodeHeader({ node, manifest, compact = false }: { node: NodeInfo; manifest?: ModuleManifest; compact?: boolean }) {
  const { i18n } = useTranslation();
  const kind = localize(manifest?.label, i18n.language, node.module);
  const stale = useRealtimeStatus((s) => s.lost);
  return (
    <View className="flex-row items-center justify-between">
      <ModuleIcon name={manifest?.icon} muted={!node.online || stale} size={compact ? 34 : 40} />
      <View className="flex-1 px-3">
        <Text className={`${compact ? 'text-base' : 'text-lg'} font-semibold ${node.online ? 'text-ink' : 'text-muted'}`} numberOfLines={1}>
          {node.name ?? kind}
        </Text>
        <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
          {node.name ? `${kind} · ` : ''}
          {node.id}
          {compact ? '' : ` · ${node.fw}`}
        </Text>
      </View>
      <StatusBadge online={node.online} stale={stale} compact={compact} />
    </View>
  );
}

/**
 * Online / offline; compact shows only the dot and a short label. `stale`: the client has no
 * server, so the node's state is unknown ("No data") whatever it was.
 */
export function StatusBadge({ online, stale = false, compact = false }: { online: boolean; stale?: boolean; compact?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (stale) {
    return (
      <View className={`flex-row items-center rounded-full bg-line ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'}`}>
        <CloudOff size={compact ? 11 : 12} color={colors.muted} />
        <Text className={`ml-1.5 ${compact ? 'text-[11px]' : 'text-xs'} font-medium text-muted`}>{t('dashboard.noServerData')}</Text>
      </View>
    );
  }
  return (
    <View className={`flex-row items-center rounded-full ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'} ${online ? 'bg-accent/15' : 'bg-line'}`}>
      <View className={`mr-1.5 h-2 w-2 rounded-full ${online ? 'bg-accent' : 'bg-muted'}`} />
      <Text className={`${compact ? 'text-[11px]' : 'text-xs'} font-medium ${online ? 'text-accent' : 'text-muted'}`}>
        {online ? t('dashboard.online') : t('dashboard.offline')}
      </Text>
    </View>
  );
}
