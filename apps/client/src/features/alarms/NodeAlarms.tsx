import { AlarmRecord, ModuleManifest, NodeInfo, PERMISSIONS, hasPermission, localize } from '@integralo/contract';
import { BellOff, CircleAlert, CircleCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useAcknowledgeAlarm, useModules, useNodes, useOpenAlarms } from '@/api/queries';
import { Button } from '@/components/ui';
import { useSession } from '@/features/auth/session.store';
import { useTheme } from '@/theme/ThemeProvider';

/** Built-in alarm of the core, not declared by modules. */
const COMM_LOSS = 'commLoss';

/** Open alarms of one node (detail screen). */
export function NodeAlarms({ nodeId }: { nodeId: string }) {
  const alarms = (useOpenAlarms().data ?? []).filter((a) => a.nodeId === nodeId && a.state !== 'closed');
  return <AlarmList alarms={alarms} />;
}

/**
 * List of alarms with the SCADA states (RF-05) and the acknowledge action.
 * Active alarms are red; alarms back to normal but not yet acknowledged, amber.
 */
export function AlarmList({ alarms, showNode = false }: { alarms: AlarmRecord[]; showNode?: boolean }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const permissions = useSession((s) => s.user?.permissions ?? []);
  const nodes = useNodes().data ?? [];
  const manifests = useModules().data ?? [];
  const acknowledge = useAcknowledgeAlarm();
  const canAck = hasPermission(permissions, PERMISSIONS.alarmsAck);

  const nodeOf = (id: string): NodeInfo | undefined => nodes.find((n) => n.id === id);
  const manifestOf = (node?: NodeInfo): ModuleManifest | undefined => manifests.find((m) => m.id === node?.module);
  const name = (alarm: AlarmRecord) =>
    alarm.key === COMM_LOSS
      ? t('alarms.commLoss')
      : localize(manifestOf(nodeOf(alarm.nodeId))?.alarms.find((a) => a.key === alarm.key)?.label, i18n.language, alarm.key);

  if (alarms.length === 0) {
    return (
      <View className="flex-row items-center">
        <BellOff size={16} color={colors.muted} />
        <Text className="ml-2 text-sm text-muted">{t('alarms.none')}</Text>
      </View>
    );
  }

  return (
    <View>
      {alarms.map((alarm) => {
        const active = alarm.state === 'active' || alarm.state === 'acknowledged';
        const Icon = active ? CircleAlert : CircleCheck;
        const node = nodeOf(alarm.nodeId);
        return (
          <View
            key={alarm.id}
            className={`mb-3 rounded-xl border p-3 ${active ? 'border-danger/40 bg-danger/10' : 'border-warning/40 bg-warning/10'}`}
          >
            <View className="flex-row items-center">
              <Icon size={18} color={active ? colors.danger : colors.warning} />
              <Text className="ml-2 flex-1 text-base font-semibold text-ink">{name(alarm)}</Text>
              <Text className={`text-xs font-semibold ${active ? 'text-danger' : 'text-warning'}`}>{t(`alarms.state.${alarm.state}`)}</Text>
            </View>
            {showNode ? <Text className="ml-7 mt-1 text-xs font-medium text-ink">{node?.name ?? alarm.nodeId}</Text> : null}
            <Text className="ml-7 mt-1 text-xs text-muted">
              {t('alarms.raisedAt', { time: new Date(alarm.raisedAt).toLocaleTimeString(i18n.language) })}
              {alarm.raisedValue !== null ? ` · ${t('alarms.value', { value: alarm.raisedValue.toLocaleString(i18n.language) })}` : ''}
            </Text>
            {alarm.count > 1 ? (
              <Text className="ml-7 mt-1 text-xs font-medium text-ink">
                {t('alarms.repeated', { count: alarm.count, time: new Date(alarm.lastRaisedAt).toLocaleTimeString(i18n.language) })}
              </Text>
            ) : null}
            {alarm.ackedBy ? <Text className="ml-7 mt-1 text-xs text-muted">{t('alarms.ackedBy', { user: alarm.ackedBy })}</Text> : null}
            {canAck && alarm.ackedAt === null ? (
              <Button
                label={t('alarms.acknowledge')}
                variant="ghost"
                busy={acknowledge.isPending && acknowledge.variables === alarm.id}
                onPress={() => acknowledge.mutate(alarm.id)}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
