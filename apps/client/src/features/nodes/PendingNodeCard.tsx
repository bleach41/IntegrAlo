import type { NodeInfo } from '@integralo/contract';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TextInput, View } from 'react-native';
import { useApproveNode, useModules } from '@/api/queries';
import { Card, ErrorText, SmallButton } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { NodeHeader } from './NodeCard';

/** A node that announced itself and waits for approval (RF-01): optional name and approve, on one row. */
export function PendingNodeCard({ node, canApprove }: { node: NodeInfo; canApprove: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const approve = useApproveNode();
  const manifest = useModules().data?.find((m) => m.id === node.module);

  return (
    <Card className="h-full border-warning/50 p-4">
      <NodeHeader node={node} manifest={manifest} compact />
      {canApprove ? (
        <View className="mt-3">
          <ErrorText message={approve.isError ? { key: 'common.unexpectedError' } : null} />
          <View className="flex-row items-center">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('dashboard.nodeNamePlaceholder')}
              placeholderTextColor={colors.muted}
              accessibilityLabel={t('dashboard.nodeName')}
              autoCapitalize="sentences"
              className="mr-2 h-9 flex-1 rounded-lg border border-line bg-canvas px-3 text-sm text-ink"
            />
            <SmallButton
              label={t('dashboard.approve')}
              busy={approve.isPending}
              icon={<Check size={14} color={colors.accent} />}
              onPress={() => approve.mutate({ nodeId: node.id, name: name.trim() || undefined })}
            />
          </View>
        </View>
      ) : (
        <Text className="mt-3 text-xs text-muted">{t('dashboard.waitingApproval')}</Text>
      )}
    </Card>
  );
}
