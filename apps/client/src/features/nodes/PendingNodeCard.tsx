import { localize, type NodeInfo } from '@integralo/contract';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useApproveNode, useModules } from '@/api/queries';
import { Button, Card, ErrorText, Field } from '@/components/ui';
import { ModuleIcon } from './ModuleIcon';
import { StatusBadge } from './NodeCard';

/** A node that announced itself and waits for approval (RF-01). */
export function PendingNodeCard({ node, canApprove }: { node: NodeInfo; canApprove: boolean }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const approve = useApproveNode();
  const { i18n } = useTranslation();
  const manifest = useModules().data?.find((m) => m.id === node.module);

  return (
    <Card className="h-full border-warning/50">
      <View className="flex-row items-center justify-between">
        <ModuleIcon name={manifest?.icon} />
        <View className="flex-1 px-3">
          <Text className="text-base font-semibold text-ink">{node.id}</Text>
          <Text className="mt-0.5 text-xs text-muted">
            {localize(manifest?.label, i18n.language, node.module)} · {t('dashboard.firmware', { fw: node.fw })}
          </Text>
        </View>
        <StatusBadge online={node.online} />
      </View>
      {canApprove ? (
        <View className="mt-4">
          <ErrorText message={approve.isError ? { key: 'common.unexpectedError' } : null} />
          <Field
            label={t('dashboard.nodeName')}
            placeholder={t('dashboard.nodeNamePlaceholder')}
            value={name}
            onChangeText={setName}
            autoCapitalize="sentences"
          />
          <Button
            label={t('dashboard.approve')}
            busy={approve.isPending}
            onPress={() => approve.mutate({ nodeId: node.id, name: name.trim() || undefined })}
          />
        </View>
      ) : (
        <Text className="mt-3 text-sm text-muted">{t('dashboard.waitingApproval')}</Text>
      )}
    </Card>
  );
}
