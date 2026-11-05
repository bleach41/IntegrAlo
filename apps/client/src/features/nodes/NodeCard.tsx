import type { ModuleManifest, NodeInfo } from '@integralo/contract';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useLatestTelemetry } from '@/api/queries';
import { Card } from '@/components/ui';
import { formatValue, variableLabel } from './format';

/**
 * Card of an approved node. Its content comes from the module manifest, so it works for
 * any module (temperature, tank level…) without specific code.
 */
export function NodeCard({ node, manifest, alarmCount }: { node: NodeInfo; manifest?: ModuleManifest; alarmCount: number }) {
  const { t, i18n } = useTranslation();
  const latest = useLatestTelemetry(node.id, true).data;
  const variables = manifest?.variables ?? [];
  const main = variables.filter((v) => !v.simulated);
  const simulated = variables.filter((v) => v.simulated);
  const booleans = { yes: t('common.yes'), no: t('common.no') };

  return (
    <Card className="mb-4">
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

      {alarmCount > 0 ? (
        <View className="mt-3 self-start rounded-full bg-danger/15 px-3 py-1">
          <Text className="text-xs font-semibold text-danger">{t('dashboard.alarms', { count: alarmCount })}</Text>
        </View>
      ) : null}

      {latest ? (
        <>
          <View className="-mx-1 mt-4 flex-row flex-wrap">
            {main.map((variable) => (
              <View key={variable.key} className="w-1/2 p-1">
                <View className="rounded-xl bg-canvas px-3 py-2.5">
                  <Text className="text-xs text-muted">{variableLabel(variable, i18n.language)}</Text>
                  <Text className="mt-0.5 text-xl font-semibold text-ink">
                    {formatValue(variable, latest.values[variable.key], i18n.language, booleans)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          {simulated.map((variable) => (
            <Text key={variable.key} className="mt-2 text-xs text-muted">
              {variableLabel(variable, i18n.language)}: {formatValue(variable, latest.values[variable.key], i18n.language, booleans)}
            </Text>
          ))}
          <Text className="mt-3 text-xs text-muted">
            {t('dashboard.updatedAt', { time: new Date(latest.receivedAt).toLocaleTimeString(i18n.language) })}
          </Text>
        </>
      ) : (
        <Text className="mt-4 text-sm text-muted">{t('dashboard.noData')}</Text>
      )}
    </Card>
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
