import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path, Polygon, Text } from 'react-native-svg';
import { formatValue } from '@/features/nodes/format';
import { Readout } from '@/features/visual/Readout';
import { FLOW_DASH, useFlowOffset } from '@/features/visual/useFlow';
import { VisualProps, isAlarmActive, threshold } from '@/features/visual/types';
import { useTheme } from '@/theme/ThemeProvider';

/** Cylinder seen from above at an angle: centre x, top and bottom of the walls, radii. */
const TANK = { cx: 160, top: 42, bottom: 172, rx: 58, ry: 18 };

/**
 * Illustrated view of the tank, in thin lines: a cylinder whose water rises and falls with
 * the level, the pump with its supply pipe moving while it runs, and the house consumption
 * leaving at the bottom. Alarm thresholds are small amber marks on the side.
 */
export function TankIso({ manifest, sample, configs, alarms }: VisualProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const values = sample.values;
  const level = typeof values.level === 'number' ? values.level : 0;
  const pumpOn = values.pump === 'on';
  const consumption = typeof values.consumption === 'number' ? values.consumption : 0;
  const alarm = isAlarmActive(alarms, 'lowLevel') || isAlarmActive(alarms, 'overflow');
  const supplyOffset = useFlowOffset(pumpOn);
  const drainOffset = useFlowOffset(consumption > 0);

  const booleans = { yes: t('common.yes'), no: t('common.no') };
  const show = (key: string) => {
    const def = manifest.variables.find((v) => v.key === key);
    return def ? formatValue(def, values[key], i18n.language, booleans) : '—';
  };
  const yOf = (pct: number) => TANK.bottom - (Math.min(100, Math.max(0, pct)) / 100) * (TANK.bottom - TANK.top);
  const left = TANK.cx - TANK.rx;
  const right = TANK.cx + TANK.rx;
  const waterY = yOf(level);
  const line = { fill: 'none', stroke: colors.muted, strokeWidth: 1.2 };
  const water = `M${left} ${waterY} L${left} ${TANK.bottom} A${TANK.rx} ${TANK.ry} 0 0 0 ${right} ${TANK.bottom} L${right} ${waterY} A${TANK.rx} ${TANK.ry} 0 0 1 ${left} ${waterY} Z`;
  const mark = (pct: number | undefined, label: string) =>
    pct === undefined ? null : (
      <>
        <Line x1={right - 2} x2={right + 8} y1={yOf(pct) + TANK.ry * 0.6} y2={yOf(pct) + TANK.ry * 0.6} stroke={colors.warning} strokeWidth={1.4} />
        <Text x={right + 11} y={yOf(pct) + TANK.ry * 0.6 + 3.5} fontSize={10} fill={colors.warning}>
          {`${label} ${pct}`}
        </Text>
      </>
    );

  return (
    <View>
      <Svg viewBox="0 0 300 220" width="100%" style={{ aspectRatio: 300 / 220 }}>
        {/* Water body and its surface */}
        <Path d={water} fill={colors.info} fillOpacity={0.28} />
        <Ellipse cx={TANK.cx} cy={waterY} rx={TANK.rx} ry={TANK.ry} fill={colors.info} fillOpacity={0.35} stroke={colors.info} strokeWidth={1.2} />

        {/* Tank walls */}
        <Ellipse cx={TANK.cx} cy={TANK.top} rx={TANK.rx} ry={TANK.ry} {...line} />
        <Line x1={left} x2={left} y1={TANK.top} y2={TANK.bottom} {...line} />
        <Line x1={right} x2={right} y1={TANK.top} y2={TANK.bottom} {...line} />
        <Path d={`M${left} ${TANK.bottom} A${TANK.rx} ${TANK.ry} 0 0 0 ${right} ${TANK.bottom}`} {...line} />
        {mark(threshold(configs, 'overflow'), t('visual.high'))}
        {mark(threshold(configs, 'lowLevel'), t('visual.low'))}

        {/* Pump on the ground and its supply pipe up to the top of the tank */}
        <Polygon points="34,196 64,196 64,182 34,182" {...line} />
        <Circle cx={49} cy={176} r={9} {...line} stroke={pumpOn ? colors.info : colors.muted} />
        <Path
          d={`M49 167 V18 H${TANK.cx - 20} V${TANK.top - 6}`}
          fill="none"
          stroke={pumpOn ? colors.info : colors.muted}
          strokeWidth={1.8}
          strokeDasharray={pumpOn ? FLOW_DASH : undefined}
          strokeDashoffset={supplyOffset}
        />

        {/* Consumption leaving at the bottom */}
        <Path
          d={`M${right - 6} ${TANK.bottom + 8} H290`}
          fill="none"
          stroke={consumption > 0 ? colors.info : colors.muted}
          strokeWidth={1.8}
          strokeDasharray={consumption > 0 ? FLOW_DASH : undefined}
          strokeDashoffset={drainOffset}
        />
        {alarm ? <Circle cx={TANK.cx} cy={TANK.top - TANK.ry - 8} r={4} fill={colors.warning} /> : null}
      </Svg>
      <Readout manifest={manifest} alarms={alarms} parts={[show('level'), show('volume'), show('pump'), show('mode')]} />
    </View>
  );
}
