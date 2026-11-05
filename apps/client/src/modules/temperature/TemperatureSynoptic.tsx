import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Rect, Text } from 'react-native-svg';
import { formatValue } from '@/features/nodes/format';
import { Readout } from '@/features/visual/Readout';
import { ScadaBar } from '@/features/visual/ScadaBar';
import { FLOW_DASH, useFlowOffset } from '@/features/visual/useFlow';
import { VisualProps, isAlarmActive, threshold } from '@/features/visual/types';
import { useTheme } from '@/theme/ThemeProvider';

const AIR_X = [85, 115, 145];

/**
 * ISA-101 synoptic of the room: split unit AC-01, its cold air (blue and moving only while
 * cooling), temperature transmitter TT-01 and a 16–32 °C bar with setpoint (SP) and high
 * alarm (HI). Everything is grey except the state: blue for cooling, amber in alarm.
 */
export function TemperatureSynoptic({ node, manifest, sample, configs, alarms }: VisualProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const values = sample.values;
  const temperature = typeof values.temperature === 'number' ? values.temperature : undefined;
  const setpoint = typeof values.setpoint === 'number' ? values.setpoint : undefined;
  const output = typeof values.output === 'number' ? values.output : 0;
  const mode = values.mode;
  const cooling = mode !== 'off' && output > 0;
  const highAlarm = isAlarmActive(alarms, 'highTemp');
  const offset = useFlowOffset(cooling);

  const variable = (key: string) => manifest.variables.find((v) => v.key === key);
  const booleans = { yes: t('common.yes'), no: t('common.no') };
  const show = (key: string) => {
    const def = variable(key);
    return def ? formatValue(def, values[key], i18n.language, booleans) : '—';
  };
  const range = (() => {
    const def = variable('temperature');
    return def?.type === 'number' && def.displayRange ? def.displayRange : { min: 16, max: 32 };
  })();
  const state = mode === 'off' ? t('temperature.off') : cooling ? t('temperature.cooling') : t('temperature.idle');
  const number = (v: number) => v.toLocaleString(i18n.language, { maximumFractionDigits: 1 });

  return (
    <View>
      <Svg viewBox="0 0 300 200" width="100%" style={{ aspectRatio: 300 / 200 }}>
        <Rect x={14} y={12} width={196} height={176} rx={4} fill="none" stroke={colors.muted} strokeWidth={1.4} />
        <Text x={22} y={180} fontSize={11} fill={colors.muted}>
          {node.name ?? t('visual.room')}
        </Text>

        <Rect x={57} y={24} width={116} height={24} rx={3} fill="none" stroke={cooling ? colors.info : colors.muted} strokeWidth={1.4} />
        <Text x={115} y={40} fontSize={11} fill={colors.ink} textAnchor="middle">
          Split AC-01
        </Text>

        {cooling
          ? AIR_X.map((x) => (
              <G key={x}>
                <Line x1={x} x2={x} y1={54} y2={84} stroke={colors.info} strokeWidth={1.8} strokeDasharray={FLOW_DASH} strokeDashoffset={offset} />
                <Polygon points={`${x - 4},${84} ${x + 4},${84} ${x},${91}`} fill={colors.info} />
              </G>
            ))
          : null}

        <Circle cx={115} cy={134} r={15} fill="none" stroke={highAlarm ? colors.warning : colors.muted} strokeWidth={1.4} />
        <Text x={115} y={138} fontSize={11} fill={colors.ink} textAnchor="middle">
          TT
        </Text>
        <Text x={115} y={164} fontSize={11} fill={colors.muted} textAnchor="middle">
          TT-01
        </Text>

        {temperature !== undefined ? (
          <ScadaBar
            x={240}
            y={20}
            width={16}
            height={160}
            min={range.min}
            max={range.max}
            value={temperature}
            setpoint={setpoint}
            high={threshold(configs, 'highTemp')}
            alarm={highAlarm}
            format={number}
            labels={{ high: t('visual.high'), low: t('visual.low'), setpoint: t('visual.setpoint') }}
          />
        ) : null}
      </Svg>
      <Readout
        manifest={manifest}
        alarms={alarms}
        parts={[show('temperature'), t('temperature.setpoint', { value: show('setpoint') }), state]}
      />
    </View>
  );
}
