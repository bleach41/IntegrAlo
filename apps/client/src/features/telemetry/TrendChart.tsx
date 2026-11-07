import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

export interface Series {
  key: string;
  label: string;
  color: string;
  /** A reference such as a setpoint: drawn dashed. */
  dashed?: boolean;
  /** [time in ms, value] ordered by time. */
  points: Array<[number, number]>;
}

/** An alarm threshold drawn across the chart. */
export interface Threshold {
  key: string;
  label: string;
  value: number;
  type: 'high' | 'low';
}

/** A state drawn as a strip under the chart: the darker, the more "on". */
export interface Band {
  key: string;
  label: string;
  color: string;
  /** [time in ms, intensity 0–1, value as text] ordered by time. */
  points: Array<[number, number, string]>;
}

const PLOT_HEIGHT = 150;
const BAND_HEIGHT = 12;
const BAND_GAP = 4;
const AXIS_HEIGHT = 18;
const PAD = { left: 40, right: 8, top: 10 };
const GRID_LINES = 4;
const TIP_WIDTH = 190;

/**
 * Own line chart drawn with SVG (no chart library): several series sharing one unit over a
 * fixed time window, alarm thresholds, state bands under it and a cursor that shows the exact
 * values at a time (mouse over it, or touch and drag on a phone). A gap in the readings (node
 * offline) is left as a gap instead of being bridged by a straight line.
 */
export function TrendChart({
  series,
  unit,
  decimals = 1,
  from,
  to,
  thresholds = [],
  bands = [],
  legend = true,
}: {
  series: Series[];
  unit?: string;
  decimals?: number;
  from: number;
  to: number;
  thresholds?: Threshold[];
  bands?: Band[];
  /** Off when the chart has a single line already named above it. */
  legend?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);

  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return null;

  let vMin = Math.min(...all.map((p) => p[1]));
  let vMax = Math.max(...all.map((p) => p[1]));
  // A threshold close to the data is brought into view; a far one would flatten the curve, so it
  // is only named at the edge.
  const span = Math.max(vMax - vMin, 1);
  for (const th of thresholds) {
    if (th.value >= vMin - span / 2 && th.value <= vMax + span / 2) {
      vMin = Math.min(vMin, th.value);
      vMax = Math.max(vMax, th.value);
    }
  }
  const margin = (vMax - vMin) * 0.1 || 1;
  vMin -= margin;
  vMax += margin;

  const bandsHeight = bands.length * (BAND_HEIGHT + BAND_GAP);
  const height = PAD.top + PLOT_HEIGHT + bandsHeight + AXIS_HEIGHT;
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const x = (time: number) => PAD.left + ((time - from) / (to - from || 1)) * plotW;
  const timeAt = (px: number) => from + ((px - PAD.left) / plotW) * (to - from);
  const y = (v: number) => PAD.top + (1 - (v - vMin) / (vMax - vMin)) * PLOT_HEIGHT;
  const long = to - from > 24 * 3_600_000;
  const time = (ms: number, seconds = false) =>
    long
      ? new Date(ms).toLocaleString(i18n.language, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : new Date(ms).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
  const number = (v: number) => v.toLocaleString(i18n.language, { maximumFractionDigits: decimals });
  const withUnit = (v: number) => `${number(v)}${unit ? ` ${unit}` : ''}`;
  // Axis labels need enough decimals to tell grid lines apart (e.g. −1, −0.5, 0 …).
  const gridStep = (vMax - vMin) / GRID_LINES;
  const axisDecimals = Math.max(decimals, gridStep >= 1 ? 0 : Math.ceil(-Math.log10(gridStep)));
  const axis = (v: number) => v.toLocaleString(i18n.language, { maximumFractionDigits: axisDecimals });

  const step = typicalStep(series.map((s) => s.points));
  const maxPoints = Math.max(200, Math.round(plotW * 2));

  // Cursor: nearest reading of each series to the time under the pointer.
  const cursorTime = cursor === null ? null : timeAt(cursor);
  const at = cursorTime === null ? [] : series.map((s) => ({ series: s, point: nearest(s.points, cursorTime, step) }));
  const bandAt = cursorTime === null ? [] : bands.map((b) => ({ band: b, point: nearest(b.points, cursorTime, step) }));
  const shown = at.find((a) => a.point)?.point?.[0] ?? cursorTime;

  const onPointer = (e: { nativeEvent: { offsetX?: number; locationX?: number } }) => {
    const px = e.nativeEvent.offsetX ?? e.nativeEvent.locationX;
    if (px === undefined) return;
    setCursor(Math.min(PAD.left + plotW, Math.max(PAD.left, px)));
  };

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <View style={{ height }}>
          <Svg width={width} height={height}>
            {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
              const v = vMin + ((vMax - vMin) * i) / GRID_LINES;
              return (
                <Line key={`g${i}`} x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={colors.line} strokeWidth={1} />
              );
            })}
            {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
              const v = vMin + ((vMax - vMin) * i) / GRID_LINES;
              return (
                <SvgText key={`l${i}`} x={PAD.left - 6} y={y(v) + 4} fontSize={10} fill={colors.muted} textAnchor="end">
                  {axis(v)}
                </SvgText>
              );
            })}

            {thresholds.map((th) =>
              th.value > vMax || th.value < vMin ? null : (
                <Line key={th.key} x1={PAD.left} x2={width - PAD.right} y1={y(th.value)} y2={y(th.value)} stroke={colors.danger} strokeWidth={1} strokeDasharray="2 3" />
              ),
            )}

            {series.map((s) =>
              segments(thin(s.points, maxPoints), step).map((segment, i) => (
                <Polyline
                  key={`${s.key}${i}`}
                  points={segment.map(([time, v]) => `${x(time).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.dashed ? 1.5 : 2}
                  strokeDasharray={s.dashed ? '6 4' : undefined}
                  strokeLinejoin="round"
                />
              )),
            )}

            {thresholds.map((th, i) => {
              // Drawn over the curves, on a small background so a curve does not hide them. A
              // threshold out of view is named at the edge it lies beyond.
              const above = th.value > vMax;
              const out = above || th.value < vMin;
              const text = out ? `${th.label} ${withUnit(th.value)} ${above ? '↑' : '↓'}` : `${th.label} ${number(th.value)}`;
              const baseline = out
                ? above
                  ? PAD.top + 9 + i * 12
                  : PAD.top + PLOT_HEIGHT - 3 - i * 12
                : th.type === 'high'
                  ? y(th.value) - 3
                  : y(th.value) + 10;
              const textWidth = text.length * 5.4;
              return [
                <Rect key={`${th.key}bg`} x={width - PAD.right - textWidth - 3} y={baseline - 9} width={textWidth + 4} height={12} rx={2} fill={colors.surface} opacity={0.85} />,
                <SvgText key={`${th.key}t`} x={width - PAD.right} y={baseline} fontSize={9} fill={colors.danger} textAnchor="end">
                  {text}
                </SvgText>,
              ];
            })}

            {bands.map((b, i) => {
              const top = PAD.top + PLOT_HEIGHT + BAND_GAP + i * (BAND_HEIGHT + BAND_GAP);
              return [
                <Rect key={`${b.key}bg`} x={PAD.left} y={top} width={plotW} height={BAND_HEIGHT} fill={colors.line} opacity={0.5} rx={2} />,
                ...bandRects(b.points, step).map(([start, end, level], j) => (
                  <Rect
                    key={`${b.key}${j}`}
                    x={x(start)}
                    y={top}
                    width={Math.max(0.5, x(end) - x(start))}
                    height={BAND_HEIGHT}
                    fill={b.color}
                    opacity={0.15 + 0.85 * level}
                  />
                )),
              ];
            })}

            {[from, (from + to) / 2, to].map((tick, i) => (
              <SvgText
                key={`t${i}`}
                x={i === 0 ? PAD.left : i === 1 ? PAD.left + plotW / 2 : width - PAD.right}
                y={height - 5}
                fontSize={10}
                fill={colors.muted}
                textAnchor={i === 0 ? 'start' : i === 1 ? 'middle' : 'end'}
              >
                {time(tick)}
              </SvgText>
            ))}

            {cursor !== null && shown !== null ? (
              <>
                <Line x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={PAD.top + PLOT_HEIGHT + bandsHeight} stroke={colors.muted} strokeWidth={1} />
                {at.map(({ series: s, point }) =>
                  point ? <Circle key={s.key} cx={x(point[0])} cy={y(point[1])} r={3.5} fill={s.color} stroke={colors.surface} strokeWidth={1.5} /> : null,
                )}
              </>
            ) : null}
          </Svg>

          {/* Captures the pointer over the plot (an empty layer, so the position is measured on it). */}
          <View
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: AXIS_HEIGHT }}
            onPointerDown={onPointer}
            onPointerMove={onPointer}
            onPointerLeave={(e: { nativeEvent: { pointerType?: string } }) => {
              if (e.nativeEvent.pointerType === 'mouse') setCursor(null);
            }}
            accessibilityLabel={t('detail.cursorHint')}
          />

          {cursor !== null && shown !== null ? (
            <View
              pointerEvents="none"
              className="absolute rounded-lg border border-line bg-surface px-2 py-1.5"
              style={{
                top: PAD.top,
                width: TIP_WIDTH,
                left: x(shown) + 10 + TIP_WIDTH < width ? x(shown) + 10 : Math.max(0, x(shown) - 10 - TIP_WIDTH),
              }}
            >
              <Text className="mb-0.5 text-xs font-medium text-ink">{time(shown, true)}</Text>
              {at.map(({ series: s, point }) => (
                <Text key={s.key} className="text-xs text-muted" numberOfLines={1}>
                  <Text style={{ color: s.color }}>● </Text>
                  {s.label}: {point ? withUnit(point[1]) : '—'}
                </Text>
              ))}
              {bandAt.map(({ band: b, point }) => (
                <Text key={b.key} className="text-xs text-muted" numberOfLines={1}>
                  <Text style={{ color: b.color }}>■ </Text>
                  {b.label}: {point ? point[2] : '—'}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ height }} />
      )}

      <View className={legend ? 'mt-2 flex-row flex-wrap' : 'hidden'}>
        {series.map((s) => {
          const last = s.points[s.points.length - 1];
          return (
            <View key={s.key} className="mb-1 mr-4 flex-row items-center">
              {s.dashed ? (
                <View className="mr-1.5 h-0.5 w-3" style={{ backgroundColor: s.color }} />
              ) : (
                <View className="mr-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              )}
              <Text className="text-xs text-muted">
                {s.label}
                {last ? `: ${withUnit(last[1])}` : ''}
              </Text>
            </View>
          );
        })}
        {bands.map((b) => {
          const last = b.points[b.points.length - 1];
          return (
            <View key={b.key} className="mb-1 mr-4 flex-row items-center">
              <View className="mr-1.5 h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: b.color }} />
              <Text className="text-xs text-muted">
                {b.label}
                {last ? `: ${last[2]}` : ''}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Usual time between readings (the median), to tell a gap from the normal pace. */
function typicalStep(seriesPoints: Array<Array<[number, ...unknown[]]>>): number {
  const steps: number[] = [];
  for (const points of seriesPoints) for (let i = 1; i < points.length; i++) steps.push(points[i][0] - points[i - 1][0]);
  if (steps.length === 0) return Infinity;
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)];
}

/**
 * Whether the readings stopped between points i−1 and i: the interval is more than three times
 * both the usual one and the one just before. The second condition keeps a slower stretch (a node
 * that reported less often, or older averaged data) from being cut at every point.
 */
function isGap(points: Array<[number, ...unknown[]]>, i: number, step: number): boolean {
  const dt = points[i][0] - points[i - 1][0];
  const before = i >= 2 ? points[i - 1][0] - points[i - 2][0] : step;
  return dt > 3 * Math.max(step, before);
}

function segments(points: Array<[number, number]>, step: number): Array<Array<[number, number]>> {
  const result: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  points.forEach((point, i) => {
    if (current.length && isGap(points, i, step)) {
      result.push(current);
      current = [];
    }
    current.push(point);
  });
  if (current.length) result.push(current);
  return result;
}

/** Each reading holds until the next one (or for one usual interval before a gap); equal runs merge. */
function bandRects(points: Array<[number, number, string]>, step: number): Array<[number, number, number]> {
  const rects: Array<[number, number, number]> = [];
  for (let i = 0; i < points.length; i++) {
    const [start, level] = points[i];
    const end = i + 1 < points.length && !isGap(points, i + 1, step) ? points[i + 1][0] : start + (Number.isFinite(step) ? step : 0);
    if (level <= 0) continue;
    const last = rects[rects.length - 1];
    if (last && last[1] === start && last[2] === level) last[1] = end;
    else rects.push([start, end, level]);
  }
  return rects;
}

/** Reading closest in time, unless that moment falls in a gap of the readings. */
function nearest<P extends [number, ...unknown[]]>(points: P[], time: number, step: number): P | undefined {
  if (points.length === 0) return undefined;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] < time) lo = mid + 1;
    else hi = mid;
  }
  const candidates = [points[lo - 1], points[lo]].filter((p): p is P => p !== undefined);
  const best = candidates.reduce((a, b) => (Math.abs(b[0] - time) < Math.abs(a[0] - time) ? b : a));
  const between = lo >= 1 && points[lo][0] >= time && points[lo - 1][0] <= time;
  if (between && !isGap(points, lo, step)) return best;
  return Math.abs(best[0] - time) <= 3 * step ? best : undefined;
}

function thin<P>(points: P[], max: number): P[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const result: P[] = [];
  for (let i = 0; i < max; i++) result.push(points[Math.floor(i * step)]);
  result.push(points[points.length - 1]);
  return result;
}
