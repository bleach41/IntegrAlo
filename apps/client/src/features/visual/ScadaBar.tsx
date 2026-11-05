import { G, Line, Polygon, Rect, Text } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  x: number;
  y: number;
  width: number;
  height: number;
  min: number;
  max: number;
  value: number;
  setpoint?: number;
  high?: number;
  low?: number;
  /** Fill colour switches to the warning colour while an alarm is active (ISA-101). */
  alarm: boolean;
  /** Formats scale and line labels (e.g. "27"). */
  format: (value: number) => string;
  labels: { high: string; low: string; setpoint: string };
}

/**
 * Vertical bar in the ISA-101 style: grey scale and fill, a dashed line per alarm
 * threshold, a triangle at the setpoint, and colour only for an abnormal state.
 */
export function ScadaBar({ x, y, width, height, min, max, value, setpoint, high, low, alarm, format, labels }: Props) {
  const { colors } = useTheme();
  const yOf = (v: number) => y + height - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * height;
  const fillTop = yOf(value);
  const labelX = x + width + 6;

  return (
    <G>
      <Rect x={x} y={y} width={width} height={height} rx={2} fill="none" stroke={colors.muted} strokeWidth={1.2} />
      <Rect
        x={x + 1.5}
        y={fillTop}
        width={width - 3}
        height={Math.max(0, y + height - 1.5 - fillTop)}
        fill={alarm ? colors.warning : colors.muted}
        opacity={alarm ? 1 : 0.55}
      />
      <Text x={labelX} y={y + 4} fontSize={10} fill={colors.muted}>
        {format(max)}
      </Text>
      <Text x={labelX} y={y + height + 3} fontSize={10} fill={colors.muted}>
        {format(min)}
      </Text>
      {high !== undefined ? (
        <G>
          <Line x1={x - 5} x2={x + width + 3} y1={yOf(high)} y2={yOf(high)} stroke={colors.warning} strokeWidth={1.2} strokeDasharray="3 2" />
          <Text x={labelX} y={yOf(high) + 3.5} fontSize={10} fill={colors.warning}>
            {`${labels.high} ${format(high)}`}
          </Text>
        </G>
      ) : null}
      {low !== undefined ? (
        <G>
          <Line x1={x - 5} x2={x + width + 3} y1={yOf(low)} y2={yOf(low)} stroke={colors.warning} strokeWidth={1.2} strokeDasharray="3 2" />
          <Text x={labelX} y={yOf(low) + 3.5} fontSize={10} fill={colors.warning}>
            {`${labels.low} ${format(low)}`}
          </Text>
        </G>
      ) : null}
      {setpoint !== undefined ? (
        <G>
          <Polygon
            points={`${x - 10},${yOf(setpoint) - 4.5} ${x - 3},${yOf(setpoint)} ${x - 10},${yOf(setpoint) + 4.5}`}
            fill={colors.ink}
          />
          <Text x={x - 13} y={yOf(setpoint) + 3.5} fontSize={10} fill={colors.ink} textAnchor="end">
            {labels.setpoint}
          </Text>
        </G>
      ) : null}
    </G>
  );
}
