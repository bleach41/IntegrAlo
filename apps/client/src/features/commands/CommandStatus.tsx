import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useCommand } from '@/api/queries';

/** How long a confirmation stays before fading out; errors stay until the next command. */
const CONFIRMED_VISIBLE_MS = 4000;
/** Height kept for the status line (one line of small text), empty or not. */
const STATUS_LINE_HEIGHT = 20;

/**
 * Live state of the last command sent from a form (RF-04: no command stays undefined).
 * It lives in a line of fixed height that is always reserved, so appearing, changing or fading
 * never moves the rest of the screen; `hint` (why the command is not available now) uses the
 * same line when there is no state to show.
 */
export function CommandStatus({ commandId, failed, hint }: { commandId?: string; failed: boolean; hint?: string }) {
  const { t, i18n } = useTranslation();
  const command = useCommand(commandId).data;
  const status = failed ? 'failed' : command?.status;
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    setFaded(false);
    if (status !== 'confirmed') return;
    const timer = setTimeout(() => setFaded(true), CONFIRMED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [status, commandId]);

  // Reasons are codes sent by the node; unknown codes are shown as they are.
  const reason = (code: string) => {
    const key = `commands.reasons.${code}`;
    return i18n.exists(key) ? t(key as 'commands.reasons.out_of_range') : code;
  };

  let message: { text: string; tone: string } | null = null;
  if (status === 'failed') message = { text: t('commands.failed'), tone: 'text-danger' };
  else if (status === 'sent') message = { text: t('commands.sending'), tone: 'text-muted' };
  else if (status === 'confirmed' && command && !faded)
    message = { text: t('commands.confirmed', { ms: (command.resolvedAt ?? command.sentAt) - command.sentAt }), tone: 'text-accent' };
  else if (status === 'rejected') message = { text: t('commands.rejected', { reason: reason(command?.reason ?? '') }), tone: 'text-danger' };
  else if (status === 'unconfirmed') message = { text: t('commands.unconfirmed'), tone: 'text-warning' };
  else if (hint) message = { text: hint, tone: 'text-muted' };

  return (
    <View className="mt-2 justify-center" style={{ minHeight: STATUS_LINE_HEIGHT }}>
      {message ? (
        <Animated.Text
          key={message.text}
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(300)}
          className={`text-xs ${message.tone}`}
          numberOfLines={2}
        >
          {message.text}
        </Animated.Text>
      ) : null}
    </View>
  );
}
