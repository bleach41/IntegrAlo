import { Check } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Platform, Text, View } from 'react-native';
import { useCommand } from '@/api/queries';
import { useTheme } from '@/theme/ThemeProvider';

/** How long a confirmation stays bright before settling into a quiet trace. */
const CONFIRMED_BRIGHT_MS = 3000;
/** Height kept for the status line (one line of small text), empty or not. */
const STATUS_LINE_HEIGHT = 18;

/**
 * Live state of the last command sent from a form (RF-04: no command stays undefined), in a
 * line that is always reserved, so nothing on screen moves when it changes; only a message too
 * long for one line (a rejection reason on a phone) takes a second line rather than being cut.
 * - sending: a pulsing dot and "Sending to the node…";
 * - confirmed: green with the round-trip time, and after a few seconds a quiet grey trace
 *   ("Confirmed at 13:05 · 13 ms") that stays until the next command, so the node's answer is
 *   never lost from view;
 * - rejected / not confirmed / not sent: stays, in red or amber, until the next command.
 * `hint` (why the command is not available now) uses the same line when there is no state.
 * A change fades the previous message out and then the new one in, in the same place (one after
 * the other, never both at once, so they do not overlap or flash).
 */
export function CommandStatus({
  commandId,
  failed,
  hint,
  align = 'left',
}: {
  commandId?: string;
  failed: boolean;
  hint?: string;
  align?: 'left' | 'center';
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const command = useCommand(commandId).data;
  const status = failed ? 'failed' : command?.status;
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    if (status !== 'confirmed') return;
    const timer = setTimeout(() => setSettled(true), CONFIRMED_BRIGHT_MS);
    return () => clearTimeout(timer);
  }, [status, commandId]);

  // Reasons are codes sent by the node; unknown codes are shown as they are.
  const reason = (code: string) => {
    const key = `commands.reasons.${code}`;
    return i18n.exists(key) ? t(key as 'commands.reasons.out_of_range') : code;
  };

  let message: Message | null = null;
  if (status === 'failed') message = { text: t('commands.failed'), tone: 'text-danger' };
  else if (status === 'sent') message = { text: t('commands.sending'), tone: 'text-muted', icon: 'dot' };
  else if (status === 'confirmed' && command) {
    const ms = (command.resolvedAt ?? command.sentAt) - command.sentAt;
    message = settled
      ? {
          text: t('commands.confirmedAt', {
            time: new Date(command.resolvedAt ?? command.sentAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }),
            ms,
          }),
          tone: 'text-muted',
          icon: 'check',
          quiet: true,
        }
      : { text: t('commands.confirmed', { ms }), tone: 'text-accent', icon: 'check' };
  } else if (status === 'rejected') message = { text: t('commands.rejected', { reason: reason(command?.reason ?? '') }), tone: 'text-danger' };
  else if (status === 'unconfirmed') message = { text: t('commands.unconfirmed'), tone: 'text-warning' };
  else if (hint) message = { text: hint, tone: 'text-muted' };

  const shown = useCrossfade(message);
  const iconColor = shown.message?.quiet ? colors.muted : colors.accent;
  return (
    <View style={{ minHeight: STATUS_LINE_HEIGHT }} className="justify-center">
      {shown.message ? (
        <Animated.View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: align === 'center' ? 'center' : 'flex-start',
            opacity: shown.opacity,
          }}
        >
          {shown.message.icon === 'check' ? <Check size={12} color={iconColor} strokeWidth={2.5} /> : null}
          {shown.message.icon === 'dot' ? <PulseDot color={colors.muted} /> : null}
          <Text
            className={`flex-shrink text-xs ${shown.message.tone} ${shown.message.icon ? 'ml-1' : ''}`}
            style={{ textAlign: align }}
            numberOfLines={2}
          >
            {shown.message.text}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

interface Message {
  text: string;
  tone: string;
  icon?: 'check' | 'dot';
  /** The settled trace: drawn softer. */
  quiet?: boolean;
}

const FADE_OUT_MS = 160;
const FADE_IN_MS = 240;
const native = Platform.OS !== 'web';

/** The message on screen and its opacity: a new message waits for the old one to fade out. */
function useCrossfade(message: Message | null) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [current, setCurrent] = useState<Message | null>(null);
  const key = message ? `${message.text}|${message.tone}|${message.quiet ? 1 : 0}` : '';
  useEffect(() => {
    let cancelled = false;
    Animated.timing(opacity, { toValue: 0, duration: current ? FADE_OUT_MS : 0, easing: Easing.out(Easing.quad), useNativeDriver: native }).start(() => {
      if (cancelled) return;
      setCurrent(message);
      if (message)
        Animated.timing(opacity, { toValue: message.quiet ? 0.75 : 1, duration: FADE_IN_MS, easing: Easing.out(Easing.quad), useNativeDriver: native }).start();
    });
    return () => {
      cancelled = true;
    };
    // Only a different message starts a fade (a new render with the same one does not).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { message: current, opacity };
}

/** Small dot breathing while the node has not answered. */
function PulseDot({ color }: { color: string }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: native }),
        Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity }} />;
}
