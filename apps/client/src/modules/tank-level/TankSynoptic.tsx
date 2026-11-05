import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text } from 'react-native-svg';
import { formatValue } from '@/features/nodes/format';
import { Readout } from '@/features/visual/Readout';
import { FLOW_DASH, useFlowOffset } from '@/features/visual/useFlow';
import { VisualProps, isAlarmActive, threshold } from '@/features/visual/types';
import { useTheme } from '@/theme/ThemeProvider';

/** Tank drawing area (inner height maps 0–100 %). */
const TANK = { x: 110, y: 28, width: 92, height: 150 };

/**
 * ISA-101 synoptic of the tank: pump P-01 filling it (supply line moving while it runs),
 * level transmitter LT-01, house consumption leaving it, the water level, and dashed
 * lines at the low-level and overflow alarm thresholds. Water and flows are blue;
 * the alarm thresholds turn amber when they are reached.
 */
export function TankSynoptic({ manifest, sample, configs, alarms }: VisualProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const values = sample.values;
  const level = typeof values.level === 'number' ? values.level : 0;
  const pumpOn = values.pump === 'on';
  const consumption = typeof values.consumption === 'number' ? values.consumption : 0;
  const lowAlarm = isAlarmActive(alarms, 'lowLevel');
  const overflowAlarm = isAlarmActive(alarms, 'overflow');
  const supplyOffset = useFlowOffset(pumpOn);
  const drainOffset = useFlowOffset(consumption > 0);

  const booleans = { yes: t('common.yes'), no: t('common.no') };
  const show = (key: string) => {
    const def = manifest.variables.find((v) => v.key === key);
    return def ? formatValue(def, values[key], i18n.language, booleans) : '—';
  };
  const yOf = (pct: number) => TANK.y + TANK.height - (Math.min(100, Math.max(0, pct)) / 100) * TANK.height;
  const thresholdLine = (pct: number | undefined, active: boolean, label: string) =>
    pct === undefined ? null : (
      <G>
        <Line x1={TANK.x} x2={TANK.x + TANK.width} y1={yOf(pct)} y2={yOf(pct)} stroke={colors.warning} strokeWidth={1.2} strokeDasharray="3 2" opacity={active ? 1 : 0.7} />
        <Text x={TANK.x + TANK.width + 6} y={yOf(pct) + 3.5} fontSize={10} fill={colors.warning}>
          {`${label} ${pct}`}
        </Text>
      </G>
    );

  return (
    <View>
      <Svg viewBox="0 0 300 200" width="100%" style={{ aspectRatio: 300 / 200 }}>
        <Path
          d={`M18 168 H40 M64 168 H80 V14 H140 V${TANK.y}`}
          fill="none"
          stroke={pumpOn ? colors.info : colors.muted}
          strokeWidth={1.8}
          strokeDasharray={pumpOn ? FLOW_DASH : undefined}
          strokeDashoffset={supplyOffset}
        />
        <Circle cx={52} cy={168} r={12} fill="none" stroke={pumpOn ? colors.info : colors.muted} strokeWidth={1.4} />
        <Polygon points="46,161 46,175 61,168" fill="none" stroke={pumpOn ? colors.info : colors.muted} strokeWidth={1.2} />
        <Text x={52} y={194} fontSize={11} fill={colors.muted} textAnchor="middle">
          P-01
        </Text>

        <Rect
          x={TANK.x + 1}
          y={yOf(level)}
          width={TANK.width - 2}
          height={Math.max(0, TANK.y + TANK.height - yOf(level))}
          fill={colors.info}
          opacity={0.3}
        />
        <Line x1={TANK.x + 1} x2={TANK.x + TANK.width - 1} y1={yOf(level)} y2={yOf(level)} stroke={colors.info} strokeWidth={1.4} />
        <Rect x={TANK.x} y={TANK.y} width={TANK.width} height={TANK.height} rx={3} fill="none" stroke={colors.muted} strokeWidth={1.4} />
        {thresholdLine(threshold(configs, 'overflow'), overflowAlarm, t('visual.high'))}
        {thresholdLine(threshold(configs, 'lowLevel'), lowAlarm, t('visual.low'))}

        <Line x1={TANK.x + TANK.width} x2={TANK.x + TANK.width + 18} y1={TANK.y + 22} y2={TANK.y + 22} stroke={colors.muted} strokeWidth={1.2} />
        <Circle cx={TANK.x + TANK.width + 32} cy={TANK.y + 22} r={14} fill="none" stroke={lowAlarm || overflowAlarm ? colors.warning : colors.muted} strokeWidth={1.4} />
        <Text x={TANK.x + TANK.width + 32} y={TANK.y + 26} fontSize={11} fill={colors.ink} textAnchor="middle">
          LT
        </Text>
        <Text x={TANK.x + TANK.width + 32} y={TANK.y + 50} fontSize={11} fill={colors.muted} textAnchor="middle">
          LT-01
        </Text>

        <Path
          d={`M${TANK.x + TANK.width} ${TANK.y + TANK.height - 8} H286`}
          fill="none"
          stroke={consumption > 0 ? colors.info : colors.muted}
          strokeWidth={1.8}
          strokeDasharray={consumption > 0 ? FLOW_DASH : undefined}
          strokeDashoffset={drainOffset}
        />
        <Text x={286} y={TANK.y + TANK.height + 8} fontSize={10} fill={colors.muted} textAnchor="end">
          {t('visual.consumption')}
        </Text>
      </Svg>
      <Readout manifest={manifest} alarms={alarms} parts={[show('level'), show('volume'), show('pump'), show('mode')]} />
    </View>
  );
}
