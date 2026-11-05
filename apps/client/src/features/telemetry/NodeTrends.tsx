import { ModuleManifest, localize } from '@integralo/contract';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useHistory } from '@/api/queries';
import { Token } from '@/theme/palette';
import { useTheme } from '@/theme/ThemeProvider';
import { Series, TrendChart } from './TrendChart';

const SERIES_COLORS: Token[] = ['accent', 'warning', 'muted', 'danger'];

/**
 * Trend charts of a node built from its manifest: numeric variables are grouped by unit
 * (°C together, % apart), so each chart has a single, meaningful vertical axis.
 */
export function NodeTrends({ nodeId, manifest }: { nodeId: string; manifest: ModuleManifest }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const history = useHistory(nodeId).data ?? [];

  const groups = new Map<string, Array<Extract<ModuleManifest['variables'][number], { type: 'number' }>>>();
  for (const variable of manifest.variables) {
    if (variable.type !== 'number') continue;
    const unit = variable.unit ?? '';
    groups.set(unit, [...(groups.get(unit) ?? []), variable]);
  }

  if (history.length < 2) return <Text className="text-sm text-muted">{t('detail.noHistory')}</Text>;

  return (
    <View>
      {[...groups.entries()].map(([unit, variables]) => {
        const series: Series[] = variables.map((variable, i) => ({
          key: variable.key,
          label: localize(variable.label, i18n.language, variable.key),
          color: colors[SERIES_COLORS[i % SERIES_COLORS.length]],
          points: history.flatMap((s) => {
            const value = s.values[variable.key];
            return typeof value === 'number' ? [[s.receivedAt, value] as [number, number]] : [];
          }),
        }));
        return (
          <View key={unit} className="mb-5">
            <TrendChart series={series} unit={unit} decimals={Math.max(...variables.map((v) => v.decimals ?? 1))} />
          </View>
        );
      })}
    </View>
  );
}
