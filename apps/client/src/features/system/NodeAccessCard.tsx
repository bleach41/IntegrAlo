import { Cpu, Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useNodeAccess } from '@/api/queries';
import { Card, SmallButton } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Connection data to program into a new node (ESP32): broker address, port, topic prefix
 * and the node account. Loaded only on request, because each read is audited.
 */
export function NodeAccessCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const access = useNodeAccess();
  const [reveal, setReveal] = useState(false);
  const data = access.data;

  return (
    <Card className="mt-4">
      <Text className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">{t('nodeAccess.title')}</Text>
      <Text className="mb-4 text-xs leading-5 text-muted">{t('nodeAccess.hint')}</Text>
      {!data ? (
        <SmallButton label={t('nodeAccess.show')} busy={access.isPending} onPress={() => access.mutate()} icon={<Cpu size={14} color={colors.accent} />} />
      ) : !data.configured ? (
        <Text className="text-sm text-warning">{t('nodeAccess.notConfigured')}</Text>
      ) : (
        <View>
          <Row label={t('nodeAccess.hosts')} value={data.hosts.join('  ·  ') || '—'} />
          <Row label={t('nodeAccess.port')} value={String(data.port)} />
          <Row label={t('nodeAccess.prefix')} value={`${data.topicPrefix}/`} />
          <Row label={t('nodeAccess.username')} value={data.username} />
          <View className="flex-row items-center justify-between border-t border-line py-2.5">
            <Text className="text-sm text-muted">{t('nodeAccess.password')}</Text>
            <View className="flex-row items-center">
              <Text selectable className="mr-3 font-mono text-sm text-ink">
                {reveal ? data.password : '••••••••••••'}
              </Text>
              <Pressable onPress={() => setReveal((r) => !r)} accessibilityRole="button" accessibilityLabel={reveal ? t('nodeAccess.hide') : t('nodeAccess.reveal')}>
                {reveal ? <EyeOff size={16} color={colors.accent} /> : <Eye size={16} color={colors.accent} />}
              </Pressable>
            </View>
          </View>
        </View>
      )}
      {access.isError ? <Text className="mt-2 text-xs text-danger">{t('common.unexpectedError')}</Text> : null}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between border-t border-line py-2.5">
      <Text className="text-sm text-muted">{label}</Text>
      <Text selectable className="ml-4 flex-1 text-right font-mono text-sm text-ink">
        {value}
      </Text>
    </View>
  );
}
