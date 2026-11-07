import { ModuleManifest, VariableDef, localize } from '@integralo/contract';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { CHART_POINTS, useAlarmConfigs, useHistory } from '@/api/queries';
import { Token } from '@/theme/palette';
import { useTheme } from '@/theme/ThemeProvider';
import { Band, Series, Threshold, TrendChart } from './TrendChart';

const SERIES_COLORS: Token[] = ['accent', 'warning', 'muted', 'danger'];

const HOUR = 3_600_000;
/** Window the trend opens with. */
export const TREND_DEFAULT_WINDOW_MS = HOUR;
const WINDOWS = [
  { key: '1h', ms: HOUR },
  { key: '6h', ms: 6 * HOUR },
  { key: '24h', ms: 24 * HOUR },
  { key: '7d', ms: 7 * 24 * HOUR },
] as const;

type NumberVariable = Extract<VariableDef, { type: 'number' }>;

/**
 * Trend charts of a node built from its manifest: numeric variables are grouped by unit
 * (°C together, % apart), so each chart has a single, meaningful vertical axis. Variables marked
 * as bands (actuator output, pump) are drawn under the main chart, on the same time axis, and the
 * alarm thresholds of the node are drawn on the chart of their variable.
 */
export function NodeTrends({
  nodeId,
  manifest,
  windowMs: chosen,
  onWindowChange,
}: {
  nodeId: string;
  manifest: ModuleManifest;
  /** Window shown, when the screen keeps it (for the CSV button in the section header). */
  windowMs?: number;
  onWindowChange?: (ms: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const [own, setOwn] = useState<number>(HOUR);
  const windowMs = chosen ?? own;
  const setWindowMs = onWindowChange ?? setOwn;
  const history = useHistory(nodeId, windowMs);
  const samples = history.data ?? [];
  const configs = useAlarmConfigs(nodeId).data ?? [];

  const groups = new Map<string, NumberVariable[]>();
  const bands: Band[] = [];
  for (const variable of manifest.variables) {
    if (variable.trend === 'hidden') continue; // repeats another variable (volume = level in litres)
    if (variable.trend === 'band') {
      bands.push({
        key: variable.key,
        label: localize(variable.label, i18n.language, variable.key),
        color: colors.info,
        points: samples.flatMap((s) => {
          const value = s.values[variable.key];
          const level = intensity(variable, value);
          return level === null ? [] : [[s.receivedAt, level, formatValue(variable, value, i18n.language)] as [number, number, string]];
        }),
      });
      continue;
    }
    if (variable.type !== 'number') continue;
    const unit = variable.unit ?? '';
    groups.set(unit, [...(groups.get(unit) ?? []), variable]);
  }
  // The bands go under the chart of the variable the module puts first (its summary).
  const primaryUnit = [...groups.entries()].find(([, vars]) => vars.some((v) => v.key === manifest.summary?.primary))?.[0] ?? [...groups.keys()][0];

  const now = Date.now();
  const averaged = windowMs > HOUR;
  const bucketMin = windowMs / CHART_POINTS / 60_000;

  return (
    <View>
      <View className="mb-3 flex-row flex-wrap items-center">
        {WINDOWS.map((w) => {
          const selected = w.ms === windowMs;
          return (
            <Pressable
              key={w.key}
              onPress={() => setWindowMs(w.ms)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`mb-1 mr-2 rounded-full border px-3 py-1 ${selected ? 'border-accent bg-accent/15' : 'border-line active:bg-line'}`}
            >
              <Text className={`text-xs font-medium ${selected ? 'text-accent' : 'text-muted'}`}>{t(`detail.windows.${w.key}`)}</Text>
            </Pressable>
          );
        })}
      </View>

      {samples.length < 2 ? (
        <Text className="text-sm text-muted">{history.isPending ? ' ' : t('detail.noHistory')}</Text>
      ) : (
        [...groups.entries()].map(([unit, variables]) => {
          const keys = variables.map((v) => v.key);
          const series: Series[] = variables.map((variable, i) => ({
            key: variable.key,
            label: localize(variable.label, i18n.language, variable.key),
            color: colors[SERIES_COLORS[i % SERIES_COLORS.length]],
            dashed: variable.trend === 'reference',
            points: samples.flatMap((s) => {
              const value = s.values[variable.key];
              return typeof value === 'number' ? [[s.receivedAt, value] as [number, number]] : [];
            }),
          }));
          const thresholds: Threshold[] = configs
            .filter((c) => c.enabled && keys.includes(c.variable))
            .map((c) => ({ key: c.key, label: t(c.type === 'high' ? 'visual.high' : 'visual.low'), value: c.threshold, type: c.type }));
          // Named by its main variable (the first one that is not a reference line), so each chart
          // says what it shows; with several lines the legend under it tells them apart.
          const main = series.find((s) => !s.dashed) ?? series[0];
          const last = main.points[main.points.length - 1];
          const lone = series.length === 1 && (unit !== primaryUnit || bands.length === 0);
          return (
            <View key={unit} className="mb-5">
              <View className="mb-1 flex-row items-baseline justify-between">
                <Text className="text-sm font-medium text-ink">
                  {main.label}
                  {unit ? <Text className="font-normal text-muted">{` · ${unit}`}</Text> : null}
                </Text>
                {last ? (
                  <Text className="text-sm text-accent">
                    {last[1].toLocaleString(i18n.language, { maximumFractionDigits: variables.find((v) => v.key === main.key)?.decimals ?? 1 })}
                    {unit ? ` ${unit}` : ''}
                  </Text>
                ) : null}
              </View>
              <TrendChart
                legend={!lone}
                series={series}
                unit={unit}
                decimals={Math.max(...variables.map((v) => v.decimals ?? 1))}
                from={now - windowMs}
                to={now}
                thresholds={thresholds}
                bands={unit === primaryUnit ? bands : []}
              />
            </View>
          );
        })
      )}
      {averaged && samples.length >= 2 ? (
        <Text className="-mt-2 text-xs text-muted">
          {t('detail.averaged', { interval: bucketMin < 1 ? `${Math.round(bucketMin * 60)} s` : `${bucketMin.toLocaleString(i18n.language, { maximumFractionDigits: 0 })} min` })}
        </Text>
      ) : null}
    </View>
  );
}

/** 0–1: how "on" a band variable is; null when the sample has no usable value. */
function intensity(variable: VariableDef, value: unknown): number | null {
  if (variable.type === 'number') {
    if (typeof value !== 'number') return null;
    const min = variable.displayRange?.min ?? 0;
    const max = variable.displayRange?.max ?? 100;
    return Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  }
  if (variable.type === 'boolean') return typeof value === 'boolean' ? (value ? 1 : 0) : null;
  // Enum: the first value is the rest state; averaged windows bring the most frequent value.
  return typeof value === 'string' ? (value === variable.values[0] ? 0 : 1) : null;
}

function formatValue(variable: VariableDef, value: unknown, language: string): string {
  if (variable.type === 'number' && typeof value === 'number') {
    return `${value.toLocaleString(language, { maximumFractionDigits: variable.decimals ?? 1 })}${variable.unit ? ` ${variable.unit}` : ''}`;
  }
  if (variable.type === 'enum' && typeof value === 'string') return localize(variable.valueLabels?.[value], language, value);
  return String(value);
}
