import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { useCommand } from '@/api/queries';

/** Live state of the last command sent from a form (RF-04: no command stays undefined). */
export function CommandStatus({ commandId, failed }: { commandId?: string; failed: boolean }) {
  const { t, i18n } = useTranslation();
  const command = useCommand(commandId).data;
  // Reasons are codes sent by the node; unknown codes are shown as they are.
  const reason = (code: string) => {
    const key = `commands.reasons.${code}`;
    return i18n.exists(key) ? t(key as 'commands.reasons.out_of_range') : code;
  };

  if (failed) return <Text className="mt-2 text-xs text-danger">{t('commands.failed')}</Text>;
  if (!command) return null;
  switch (command.status) {
    case 'sent':
      return <Text className="mt-2 text-xs text-muted">{t('commands.sending')}</Text>;
    case 'confirmed':
      return (
        <Text className="mt-2 text-xs text-accent">
          {t('commands.confirmed', { ms: (command.resolvedAt ?? command.sentAt) - command.sentAt })}
        </Text>
      );
    case 'rejected':
      return <Text className="mt-2 text-xs text-danger">{t('commands.rejected', { reason: reason(command.reason ?? '') })}</Text>;
    case 'unconfirmed':
      return <Text className="mt-2 text-xs text-warning">{t('commands.unconfirmed')}</Text>;
  }
}
