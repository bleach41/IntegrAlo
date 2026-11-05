import type { ModuleManifest, TelemetrySample } from '@integralo/contract';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { formatValue } from './format';

export interface SummaryProps {
  manifest: ModuleManifest;
  sample: TelemetrySample;
}

/**
 * Compact summary of any module, from its manifest: the "primary" variable large and the
 * "secondary" ones on one line. Without a summary declaration, the first variable is used.
 */
export function GenericSummary({ manifest, sample }: SummaryProps) {
  const { t, i18n } = useTranslation();
  const booleans = { yes: t('common.yes'), no: t('common.no') };
  const find = (key: string) => manifest.variables.find((v) => v.key === key);
  const primary = find(manifest.summary?.primary ?? manifest.variables[0].key) ?? manifest.variables[0];
  const secondary = (manifest.summary?.secondary ?? []).map(find).filter((v) => v !== undefined);

  return (
    <View className="items-center py-2">
      <Text className="text-5xl font-semibold tracking-tight text-ink">
        {formatValue(primary, sample.values[primary.key], i18n.language, booleans)}
      </Text>
      {secondary.length > 0 ? (
        <Text className="mt-1 text-sm text-muted">
          {secondary.map((v) => formatValue(v, sample.values[v.key], i18n.language, booleans)).join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}
