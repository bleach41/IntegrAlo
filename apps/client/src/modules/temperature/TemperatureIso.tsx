import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';
import { formatValue } from '@/features/nodes/format';
import { isoProjector } from '@/features/visual/iso';
import { Readout } from '@/features/visual/Readout';
import { FLOW_DASH, useFlowOffset } from '@/features/visual/useFlow';
import { VisualProps, isAlarmActive } from '@/features/visual/types';
import { useTheme } from '@/theme/ThemeProvider';

const { point, polygon } = isoProjector(150, 112, 92);

/**
 * Illustrated isometric view of the room, in thin lines: floor and two walls, the split
 * unit on the right wall with its status LED and cold air while cooling, a thermometer on
 * the left wall filled to the room temperature, and a piece of furniture. More vivid and
 * less precise than the synoptic: the exact values are in the readout line.
 */
export function TemperatureIso({ manifest, sample, alarms }: VisualProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const values = sample.values;
  const temperature = typeof values.temperature === 'number' ? values.temperature : 16;
  const output = typeof values.output === 'number' ? values.output : 0;
  const mode = values.mode;
  const cooling = mode !== 'off' && output > 0;
  const alarm = isAlarmActive(alarms, 'highTemp') || isAlarmActive(alarms, 'lowTemp');
  const offset = useFlowOffset(cooling);

  const range = (() => {
    const def = manifest.variables.find((v) => v.key === 'temperature');
    return def?.type === 'number' && def.displayRange ? def.displayRange : { min: 16, max: 32 };
  })();
  const booleans = { yes: t('common.yes'), no: t('common.no') };
  const show = (key: string) => {
    const def = manifest.variables.find((v) => v.key === key);
    return def ? formatValue(def, values[key], i18n.language, booleans) : '—';
  };
  const state = mode === 'off' ? t('temperature.off') : cooling ? t('temperature.cooling') : t('temperature.idle');
  const line = { fill: 'none', stroke: colors.muted, strokeWidth: 1.2, strokeLinejoin: 'round' as const };

  // Thermometer on the left wall (x = 0): its tube is vertical on screen.
  const tubeBottom = point(0, 0.55, 0.32);
  const tubeTop = point(0, 0.55, 0.72);
  const fraction = Math.min(1, Math.max(0, (temperature - range.min) / (range.max - range.min)));
  const fillTop = tubeBottom.y - (tubeBottom.y - tubeTop.y) * fraction;
  const thermoColor = alarm ? colors.warning : cooling ? colors.info : colors.muted;

  const led = point(0.6, 0.09, 0.84);
  const airPaths = [0.33, 0.5].map((x) => {
    const start = point(x, 0.1, 0.76);
    const mid = point(x + 0.06, 0.22, 0.62);
    const end = point(x, 0.34, 0.48);
    return `M${start.x} ${start.y} Q${mid.x} ${mid.y} ${end.x} ${end.y}`;
  });

  return (
    <View>
      <Svg viewBox="0 0 300 220" width="100%" style={{ aspectRatio: 300 / 220 }}>
        <Polygon points={polygon([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0])} {...line} fill={colors.line} fillOpacity={0.35} />
        <Polygon points={polygon([0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1])} {...line} />
        <Polygon points={polygon([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1])} {...line} />

        {/* Furniture on the floor */}
        <Polygon points={polygon([0.42, 0.55, 0.1], [0.8, 0.55, 0.1], [0.8, 0.88, 0.1], [0.42, 0.88, 0.1])} {...line} />
        <Polygon points={polygon([0.42, 0.88, 0], [0.8, 0.88, 0], [0.8, 0.88, 0.1], [0.42, 0.88, 0.1])} {...line} />
        <Polygon points={polygon([0.8, 0.55, 0], [0.8, 0.88, 0], [0.8, 0.88, 0.1], [0.8, 0.55, 0.1])} {...line} />

        {/* Split unit on the right wall (y = 0), sticking out towards the room */}
        <Polygon points={polygon([0.22, 0, 0.78], [0.66, 0, 0.78], [0.66, 0.08, 0.78], [0.22, 0.08, 0.78])} {...line} stroke={colors.ink} />
        <Polygon points={polygon([0.22, 0.08, 0.78], [0.66, 0.08, 0.78], [0.66, 0.08, 0.9], [0.22, 0.08, 0.9])} {...line} stroke={colors.ink} />
        <Polygon points={polygon([0.66, 0, 0.78], [0.66, 0.08, 0.78], [0.66, 0.08, 0.9], [0.66, 0, 0.9])} {...line} stroke={colors.ink} />
        <Circle cx={led.x} cy={led.y} r={2.6} fill={mode === 'off' ? 'none' : cooling ? colors.info : colors.muted} stroke={colors.muted} strokeWidth={0.8} />
        {cooling
          ? airPaths.map((d) => (
              <Path key={d} d={d} fill="none" stroke={colors.info} strokeWidth={1.8} strokeLinecap="round" strokeDasharray={FLOW_DASH} strokeDashoffset={offset} />
            ))
          : null}

        {/* Thermometer on the left wall */}
        <Rect x={tubeTop.x - 4} y={tubeTop.y} width={8} height={tubeBottom.y - tubeTop.y} rx={4} fill="none" stroke={colors.muted} strokeWidth={1.2} />
        <Rect x={tubeTop.x - 2} y={fillTop} width={4} height={Math.max(0, tubeBottom.y - fillTop)} rx={2} fill={thermoColor} />
        <Circle cx={tubeBottom.x} cy={tubeBottom.y + 4} r={5.5} fill={thermoColor} stroke={colors.muted} strokeWidth={1} />
      </Svg>
      <Readout manifest={manifest} alarms={alarms} parts={[show('temperature'), t('temperature.setpoint', { value: show('setpoint') }), state]} />
    </View>
  );
}
