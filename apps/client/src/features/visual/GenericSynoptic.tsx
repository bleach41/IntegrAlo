import { localize } from '@integralo/contract';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Text } from 'react-native-svg';
import { formatValue } from '@/features/nodes/format';
import { useTheme } from '@/theme/ThemeProvider';
import { Readout } from './Readout';
import { ScadaBar } from './ScadaBar';
import { VisualProps, isAlarmActive } from './types';

/**
 * Synoptic of a module without a drawing of its own, built from its manifest: a bar for
 * the summary variable (if it declares a display range) with its alarm thresholds.
 * Keeps the graphic view available for any module without client code (P6).
 */
export function GenericSynoptic({ manifest, sample, configs, alarms }: VisualProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const key = manifest.summary?.primary ?? manifest.variables[0].key;
  const variable = manifest.variables.find((v) => v.key === key);
  const value = sample.values[key];
  if (!variable || variable.type !== 'number' || !variable.displayRange || typeof value !== 'number') return null;

  const own = configs.filter((c) => c.variable === key && c.enabled);
  const high = own.find((c) => c.type === 'high');
  const low = own.find((c) => c.type === 'low');
  const alarm = own.some((c) => isAlarmActive(alarms, c.key));
  const booleans = { yes: t('common.yes'), no: t('common.no') };
  const number = (v: number) => v.toLocaleString(i18n.language, { maximumFractionDigits: variable.decimals ?? 1 });
  const secondary = (manifest.summary?.secondary ?? [])
    .map((k) => manifest.variables.find((v) => v.key === k))
    .filter((v) => v !== undefined)
    .map((v) => formatValue(v, sample.values[v.key], i18n.language, booleans));

  return (
    <View>
      <Svg viewBox="0 0 300 200" width="100%" style={{ aspectRatio: 300 / 200 }}>
        <Text x={110} y={100} fontSize={13} fill={colors.ink} textAnchor="middle">
          {localize(variable.label, i18n.language, key)}
        </Text>
        <ScadaBar
          x={210}
          y={20}
          width={16}
          height={160}
          min={variable.displayRange.min}
          max={variable.displayRange.max}
          value={value}
          high={high?.threshold}
          low={low?.threshold}
          alarm={alarm}
          format={number}
          labels={{ high: t('visual.high'), low: t('visual.low'), setpoint: t('visual.setpoint') }}
        />
      </Svg>
      <Readout manifest={manifest} alarms={alarms} parts={[formatValue(variable, value, i18n.language, booleans), ...secondary]} />
    </View>
  );
}
