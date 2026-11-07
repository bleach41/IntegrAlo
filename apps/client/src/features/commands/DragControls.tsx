import { useRef, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, Platform, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useScrollLock } from '@/components/ui';
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
/** Extra reach around the track for a finger (about 44 px of touch band in total, as usual). */
const TOUCH_SLOP = 16;

interface WebPointerEvent {
  nativeEvent: { offsetX: number; offsetY: number; pointerId: number };
  currentTarget: unknown;
}

/**
 * Drag handling shared by both controls, on an empty layer over the drawing; the position is
 * measured on that layer. A drag must start on the control itself (`hit`: the track and a
 * finger's width around it): a touch elsewhere over the drawing, or a page scroll whose finger
 * passes over the control, is left to the page. Nothing here is state: dragging only calls
 * `onChange` with the snapped value (unchanged values do not re-render the form).
 * - Phone: the layer becomes the touch responder and keeps it while dragging, and the screen's
 *   scroll is locked from the touch until the finger lifts (on Android the scroll view would
 *   otherwise take the moving finger and scroll the page instead of moving the control).
 * - Web: pointer events with pointer capture, and `touch-action: none` so the browser does not
 *   scroll the page under the finger. The responder system is not used there: the page scrolls
 *   anyway when the mouse wheel or a finger moves it, and each refused hand-over printed a
 *   "ScrollView doesn't take rejection well" warning.
 */
function useDrag(
  disabled: boolean,
  hit: (x: number, y: number) => boolean,
  toValue: (x: number, y: number) => number,
  onChange: (value: number) => void,
) {
  const dragging = useRef(false);
  const lockScroll = useScrollLock();
  if (disabled) return {};
  if (Platform.OS === 'web') {
    const at = (e: WebPointerEvent) => onChange(toValue(e.nativeEvent.offsetX, e.nativeEvent.offsetY));
    const target = (e: WebPointerEvent) => e.currentTarget as { setPointerCapture?: (id: number) => void };
    return {
      style: { touchAction: 'none', cursor: 'pointer' },
      onPointerDown: (e: WebPointerEvent) => {
        if (!hit(e.nativeEvent.offsetX, e.nativeEvent.offsetY)) return;
        target(e).setPointerCapture?.(e.nativeEvent.pointerId);
        dragging.current = true;
        at(e);
      },
      onPointerMove: (e: WebPointerEvent) => {
        if (dragging.current) at(e);
      },
      onPointerUp: () => {
        dragging.current = false;
      },
      onPointerCancel: () => {
        dragging.current = false;
      },
    };
  }
  const move = (e: GestureResponderEvent) => onChange(toValue(e.nativeEvent.locationX, e.nativeEvent.locationY));
  // The page stops scrolling from the touch until the finger lifts, so the whole drag moves the
  // control (Android hands a moving finger to the scroll view otherwise).
  const release = () => lockScroll(false);
  return {
    // Only a touch that starts on the track; never a moving finger that arrives from elsewhere
    // (that is a page scroll passing over the control).
    onStartShouldSetResponder: (e: GestureResponderEvent) => hit(e.nativeEvent.locationX, e.nativeEvent.locationY),
    onMoveShouldSetResponder: () => false,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      lockScroll(true);
      move(e);
    },
    onResponderMove: move,
    onResponderRelease: release,
    onResponderTerminate: release,
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
 * over the top, and the value is shown inside it. Touching or dragging along the arc moves the
 * knob; the inside of the dial (the value) and its surroundings scroll the page as usual.
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
    // A band around the arc, above the ends' level: distance to the centre close to the radius.
    (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) <= TRACK / 2 + TOUCH_SLOP && y <= cy + KNOB + 4,
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
          <View {...drag} style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, drag.style]} />
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

/** Horizontal bar for an output (0–100 %): drag or tap along it (its row is the touch band). */
export function SliderBar({ value, min, max, step, disabled, onChange }: DragProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const height = KNOB * 2 + 8;
  const left = KNOB + 2;
  const length = Math.max(1, width - 2 * left);
  const fraction = Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  const drag = useDrag(
    disabled,
    (x) => x >= left - KNOB - TOUCH_SLOP && x <= left + length + KNOB + TOUCH_SLOP,
    (x) => snap((x - left) / length, { min, max, step }),
    onChange,
  );

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
        {/* The touch layer reaches a little above and below the thin bar, for a finger. */}
        <View {...drag} style={[{ position: 'absolute', left: 0, right: 0, top: -10, bottom: -10 }, drag.style]} />
      </View>
      <View className="flex-row justify-between px-1">
        <Text className="text-xs text-muted">{min}</Text>
        <Text className="text-xs text-muted">{max}</Text>
      </View>
    </View>
  );
}
