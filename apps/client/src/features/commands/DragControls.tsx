import { useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

interface DragProps {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

const TRACK = 12;
const KNOB = 10;

/**
 * Drag handling shared by both controls: an empty layer over the drawing becomes the touch
 * responder and keeps it while dragging (a scroll view around it does not take the gesture
 * over), and the position is measured on that layer.
 */
function useDrag(disabled: boolean, toValue: (x: number, y: number) => number, onChange: (value: number) => void) {
  const move = (e: GestureResponderEvent) => onChange(toValue(e.nativeEvent.locationX, e.nativeEvent.locationY));
  return disabled
    ? {}
    : {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderTerminationRequest: () => false,
        onResponderGrant: move,
        onResponderMove: move,
      };
}

function snap(fraction: number, { min, max, step }: Pick<DragProps, 'min' | 'max' | 'step'>): number {
  const f = Math.min(1, Math.max(0, fraction));
  const raw = min + f * (max - min);
  const decimals = (String(step).split('.')[1] ?? '').length;
  const snapped = Math.round((raw - min) / step) * step + min;
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(decimals));
}

/**
 * Half-circle dial for a setpoint: the arc goes from the minimum (left) to the maximum (right)
 * over the top, and the value is shown inside it. Dragging anywhere over it moves the knob.
 */
export function ArcDial({ value, min, max, step, disabled, onChange, children }: DragProps & { children?: React.ReactNode }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const size = Math.min(width, 280);
  const r = size / 2 - KNOB - 4;
  const cx = width / 2;
  const cy = r + KNOB + 4;
  const height = cy + KNOB + 6;
  const point = (fraction: number) => {
    const angle = Math.PI * (1 - fraction);
    return { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) };
  };
  const fraction = (value - min) / (max - min || 1);
  const start = point(0);
  const end = point(1);
  const knob = point(fraction);

  const drag = useDrag(
    disabled,
    (x, y) => {
      // Angle from the centre: 180° at the left end, 0° at the right one. Below the centre it
      // sticks to the nearest end.
      let angle = Math.atan2(cy - y, x - cx);
      if (angle < 0) angle = x < cx ? Math.PI : 0;
      return snap(1 - angle / Math.PI, { min, max, step });
    },
    onChange,
  );

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ opacity: disabled ? 0.45 : 1 }}>
      {width > 0 ? (
        <View style={{ height }}>
          <Svg width={width} height={height}>
            <Path d={`M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`} fill="none" stroke={colors.line} strokeWidth={TRACK} strokeLinecap="round" />
            {fraction > 0 ? (
              <Path d={`M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${knob.x} ${knob.y}`} fill="none" stroke={colors.accent} strokeWidth={TRACK} strokeLinecap="round" />
            ) : null}
            <Circle cx={knob.x} cy={knob.y} r={KNOB} fill={colors.ink} stroke={colors.accent} strokeWidth={3} />
          </Svg>
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: cy - r * 0.62 }} className="items-center">
            {children}
          </View>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} {...drag} />
        </View>
      ) : (
        <View style={{ height: 150 }} />
      )}
      <View className="flex-row justify-between" style={{ marginHorizontal: Math.max(0, cx - r - 12) }}>
        <Text className="text-xs text-muted">{min}</Text>
        <Text className="text-xs text-muted">{max}</Text>
      </View>
    </View>
  );
}

/** Horizontal bar for an output (0–100 %): drag or tap anywhere along it. */
export function SliderBar({ value, min, max, step, disabled, onChange }: DragProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const height = KNOB * 2 + 8;
  const left = KNOB + 2;
  const length = Math.max(1, width - 2 * left);
  const fraction = Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  const drag = useDrag(disabled, (x) => snap((x - left) / length, { min, max, step }), onChange);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ opacity: disabled ? 0.45 : 1 }}>
      <View style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Rect x={left} y={height / 2 - 3} width={length} height={6} rx={3} fill={colors.line} />
            <Rect x={left} y={height / 2 - 3} width={length * fraction} height={6} rx={3} fill={colors.accent} />
            <Circle cx={left + length * fraction} cy={height / 2} r={KNOB} fill={colors.ink} stroke={colors.accent} strokeWidth={3} />
          </Svg>
        ) : null}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} {...drag} />
      </View>
      <View className="flex-row justify-between px-1">
        <Text className="text-xs text-muted">{min}</Text>
        <Text className="text-xs text-muted">{max}</Text>
      </View>
    </View>
  );
}
