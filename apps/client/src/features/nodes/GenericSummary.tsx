import type { ModuleManifest, TelemetrySample } from '@integralo/contract';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { formatValue } from './format';

export interface SummaryProps {
  manifest: ModuleManifest;
  sample: TelemetrySample;
  /** Dashboard card: value on the left and details on the right, instead of centred and large. */
  compact?: boolean;
}

/**
 * Summary of any module, from its manifest: the "primary" variable large and the
 * "secondary" ones beside or below it. Without a summary declaration, the first variable is used.
 */
export function GenericSummary({ manifest, sample, compact = false }: SummaryProps) {
  const { t, i18n } = useTranslation();
  const booleans = { yes: t('common.yes'), no: t('common.no') };
  const find = (key: string) => manifest.variables.find((v) => v.key === key);
  const primary = find(manifest.summary?.primary ?? manifest.variables[0].key) ?? manifest.variables[0];
  const secondary = (manifest.summary?.secondary ?? []).map(find).filter((v) => v !== undefined);
  const value = formatValue(primary, sample.values[primary.key], i18n.language, booleans);
  const details = secondary.map((v) => formatValue(v, sample.values[v.key], i18n.language, booleans));

  if (compact) {
    return (
      <View className="flex-row items-center justify-between">
        <Text className="text-4xl font-semibold tracking-tight text-ink">{value}</Text>
        <View className="ml-3 flex-1 items-end">
          {details.map((d) => (
            <Text key={d} className="text-xs text-muted" numberOfLines={1}>
              {d}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View className="items-center py-2">
      <Text className="text-5xl font-semibold tracking-tight text-ink">{value}</Text>
      {details.length > 0 ? <Text className="mt-1 text-sm text-muted">{details.join(' · ')}</Text> : null}
    </View>
  );
}
