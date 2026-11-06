import type { NodeInfo } from '@integralo/contract';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useRenameNode, useRetireNode } from '@/api/queries';
import { ErrorText, Field, SmallButton } from '@/components/ui';

/**
 * Engineering only: rename a node, and stop supervising it. Neither action deletes history,
 * and both need a second tap:
 * - online: "disconnect" — it loses its approval and waits, as pending, to be approved again;
 * - offline: "remove from the list" — a replaced board; it returns only if it reconnects.
 */
export function NodeManageCard({ node }: { node: NodeInfo }) {
  const { t } = useTranslation();
  const [name, setName] = useState(node.name ?? '');
  const [confirming, setConfirming] = useState(false);
  const rename = useRenameNode(node.id);
  const retire = useRetireNode(node.id);
  const changed = name.trim() !== (node.name ?? '');

  return (
    <View>
      <ErrorText message={rename.isError || retire.isError ? { key: 'common.unexpectedError' } : null} />
      <Field label={t('manage.name')} placeholder={t('dashboard.nodeNamePlaceholder')} value={name} onChangeText={setName} autoCapitalize="sentences" />
      <View className="-mt-2 mb-5 flex-row items-center">
        <SmallButton label={t('manage.saveName')} busy={rename.isPending} disabled={!changed} onPress={() => rename.mutate(name.trim())} />
        {rename.isSuccess && !changed ? <Text className="ml-3 text-xs text-accent">{t('manage.saved')}</Text> : null}
      </View>

      <Text className="mb-1 text-sm font-medium text-ink">{node.online ? t('manage.disconnect') : t('manage.retire')}</Text>
      <Text className="mb-3 text-xs leading-4 text-muted">{node.online ? t('manage.disconnectHint') : t('manage.retireHint')}</Text>
      {confirming ? (
        <View className="flex-row items-center">
          <SmallButton
            primary
            tone="danger"
            label={node.online ? t('manage.disconnectConfirm') : t('manage.retireConfirm')}
            busy={retire.isPending}
            onPress={() =>
              // mutateAsync, not mutate's onSuccess: the realtime update unmounts this card
              // as soon as the node is retired, and a per-call callback would be dropped.
              retire.mutateAsync().then(() => router.replace('/'), () => undefined)
            }
          />
          <View className="ml-2">
            <SmallButton label={t('manage.cancel')} onPress={() => setConfirming(false)} />
          </View>
        </View>
      ) : (
        <SmallButton tone="warning" label={node.online ? t('manage.disconnect') : t('manage.retire')} onPress={() => setConfirming(true)} />
      )}
    </View>
  );
}
