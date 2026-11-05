import { AlarmRecord, ModuleManifest, PERMISSIONS, hasPermission, localize } from '@integralo/contract';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useAcknowledgeAlarm, useOpenAlarms } from '@/api/queries';
import { Button } from '@/components/ui';
import { useSession } from '@/features/auth/session.store';

/** Built-in alarm of the core, not declared by modules. */
const COMM_LOSS = 'commLoss';

/** Open alarms of a node with the SCADA states and the acknowledge action (RF-05). */
export function NodeAlarms({ nodeId, manifest }: { nodeId: string; manifest?: ModuleManifest }) {
  const { t, i18n } = useTranslation();
  const permissions = useSession((s) => s.user?.permissions ?? []);
  const alarms = (useOpenAlarms().data ?? []).filter((a) => a.nodeId === nodeId && a.state !== 'closed');
  const acknowledge = useAcknowledgeAlarm();
  const canAck = hasPermission(permissions, PERMISSIONS.alarmsAck);

  const name = (alarm: AlarmRecord) =>
    alarm.key === COMM_LOSS
      ? t('alarms.commLoss')
      : localize(manifest?.alarms.find((a) => a.key === alarm.key)?.label, i18n.language, alarm.key);

  if (alarms.length === 0) return <Text className="text-sm text-muted">{t('alarms.none')}</Text>;

  return (
    <View>
      {alarms.map((alarm) => {
        const active = alarm.state === 'active' || alarm.state === 'acknowledged';
        return (
          <View key={alarm.id} className={`mb-3 rounded-xl border p-3 ${active ? 'border-danger/50 bg-danger/10' : 'border-warning/50 bg-warning/10'}`}>
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 pr-2 text-base font-semibold text-ink">{name(alarm)}</Text>
              <Text className={`text-xs font-semibold ${active ? 'text-danger' : 'text-warning'}`}>{t(`alarms.state.${alarm.state}`)}</Text>
            </View>
            <Text className="mt-1 text-xs text-muted">
              {t('alarms.raisedAt', { time: new Date(alarm.raisedAt).toLocaleTimeString(i18n.language) })}
              {alarm.raisedValue !== null ? ` · ${t('alarms.value', { value: alarm.raisedValue.toLocaleString(i18n.language) })}` : ''}
            </Text>
            {alarm.ackedBy ? <Text className="mt-1 text-xs text-muted">{t('alarms.ackedBy', { user: alarm.ackedBy })}</Text> : null}
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
