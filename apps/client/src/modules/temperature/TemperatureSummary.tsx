import { Pause, Power, Snowflake } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { formatValue } from '@/features/nodes/format';
import type { SummaryProps } from '@/features/nodes/GenericSummary';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Specific summary of the temperature module: room temperature, setpoint and mode, and
 * what the air conditioner is doing (cooling, idle or off), which the generic summary
 * cannot infer. It is optional: without it the generic summary is used.
 */
export function TemperatureSummary({ manifest, sample }: SummaryProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const booleans = { yes: t('common.yes'), no: t('common.no') };
  const variable = (key: string) => manifest.variables.find((v) => v.key === key);
  const show = (key: string) => {
    const def = variable(key);
    return def ? formatValue(def, sample.values[key], i18n.language, booleans) : '—';
  };

  const mode = sample.values.mode;
  const output = typeof sample.values.output === 'number' ? sample.values.output : 0;
  const state =
    mode === 'off'
      ? { icon: Power, label: t('temperature.off'), color: colors.muted, tone: 'bg-line' }
      : output > 0
        ? { icon: Snowflake, label: t('temperature.cooling'), color: colors.accent, tone: 'bg-accent/15' }
        : { icon: Pause, label: t('temperature.idle'), color: colors.muted, tone: 'bg-line' };
  const Icon = state.icon;

  return (
    <View className="items-center py-2">
      <Text className="text-5xl font-semibold tracking-tight text-ink">{show('temperature')}</Text>
      <Text className="mt-1 text-sm text-muted">
        {t('temperature.setpoint', { value: show('setpoint') })} · {show('mode')}
      </Text>
      <View className={`mt-3 flex-row items-center rounded-full px-3 py-1 ${state.tone}`}>
        <Icon size={14} color={state.color} />
        <Text className="ml-1.5 text-xs font-medium" style={{ color: state.color }}>
          {state.label}
          {mode !== 'off' && output > 0 && output < 100 ? ` ${Math.round(output)} %` : ''}
        </Text>
      </View>
    </View>
  );
}
