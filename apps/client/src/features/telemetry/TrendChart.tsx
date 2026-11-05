import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Line, Polyline, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

export interface Series {
  key: string;
  label: string;
  color: string;
  /** [time in ms, value] ordered by time. */
  points: Array<[number, number]>;
}

const HEIGHT = 170;
const PAD = { left: 40, right: 8, top: 10, bottom: 22 };
const MAX_POINTS = 300;
const GRID_LINES = 4;

/**
 * Own line chart drawn with SVG (no chart library): several series sharing one unit,
 * time on the horizontal axis. Long series are thinned to MAX_POINTS points.
 */
export function TrendChart({ series, unit, decimals = 1 }: { series: Series[]; unit?: string; decimals?: number }) {
  const { i18n } = useTranslation();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return null;

  const tMin = Math.min(...all.map((p) => p[0]));
  const tMax = Math.max(...all.map((p) => p[0]));
  let vMin = Math.min(...all.map((p) => p[1]));
  let vMax = Math.max(...all.map((p) => p[1]));
  const margin = (vMax - vMin) * 0.1 || 1;
  vMin -= margin;
  vMax += margin;

  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - tMin) / (tMax - tMin || 1)) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - vMin) / (vMax - vMin)) * plotH;
  const time = (t: number) => new Date(t).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const number = (v: number) => v.toLocaleString(i18n.language, { maximumFractionDigits: decimals });
  // Axis labels need enough decimals to tell grid lines apart (e.g. −1, −0.5, 0 …).
  const gridStep = (vMax - vMin) / GRID_LINES;
  const axisDecimals = Math.max(decimals, gridStep >= 1 ? 0 : Math.ceil(-Math.log10(gridStep)));
  const axis = (v: number) => v.toLocaleString(i18n.language, { maximumFractionDigits: axisDecimals });

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
            const v = vMin + ((vMax - vMin) * i) / GRID_LINES;
            return (
              <Line key={i} x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={colors.line} strokeWidth={1} />
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
          <SvgText x={PAD.left} y={HEIGHT - 6} fontSize={10} fill={colors.muted}>
            {time(tMin)}
          </SvgText>
          <SvgText x={width - PAD.right} y={HEIGHT - 6} fontSize={10} fill={colors.muted} textAnchor="end">
            {time(tMax)}
          </SvgText>
          {series.map((s) => (
            <Polyline
              key={s.key}
              points={thin(s.points)
                .map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`)
                .join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ))}
        </Svg>
      ) : (
        <View style={{ height: HEIGHT }} />
      )}
      <View className="mt-2 flex-row flex-wrap">
        {series.map((s) => {
          const last = s.points[s.points.length - 1];
          return (
            <View key={s.key} className="mb-1 mr-4 flex-row items-center">
              <View className="mr-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <Text className="text-xs text-muted">
                {s.label}
                {last ? `: ${number(last[1])}${unit ? ` ${unit}` : ''}` : ''}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function thin(points: Array<[number, number]>): Array<[number, number]> {
  if (points.length <= MAX_POINTS) return points;
  const step = points.length / MAX_POINTS;
  const result: Array<[number, number]> = [];
  for (let i = 0; i < MAX_POINTS; i++) result.push(points[Math.floor(i * step)]);
  result.push(points[points.length - 1]);
  return result;
}
