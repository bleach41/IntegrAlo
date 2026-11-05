import type { TelemetrySample, VariableDef } from '@integralo/contract';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { formatValue, variableLabel } from './format';

/** Current values of a node, laid out from the module manifest; `exclude` skips those already shown elsewhere. */
export function VariablesGrid({
  variables,
  sample,
  exclude = [],
}: {
  variables: VariableDef[];
  sample: TelemetrySample;
  exclude?: string[];
}) {
  const { t, i18n } = useTranslation();
  const booleans = { yes: t('common.yes'), no: t('common.no') };
  const main = variables.filter((v) => !v.simulated && !exclude.includes(v.key));
  const simulated = variables.filter((v) => v.simulated);

  return (
    <>
      <View className="-mx-1 flex-row flex-wrap">
        {main.map((variable) => (
          <View key={variable.key} className="w-1/2 p-1">
            <View className="rounded-xl bg-canvas px-3 py-2.5">
              <Text className="text-xs text-muted">{variableLabel(variable, i18n.language)}</Text>
              <Text className="mt-0.5 text-xl font-semibold text-ink">
                {formatValue(variable, sample.values[variable.key], i18n.language, booleans)}
              </Text>
            </View>
          </View>
        ))}
      </View>
      {simulated.map((variable) => (
        <Text key={variable.key} className="mt-2 text-xs text-muted">
          {variableLabel(variable, i18n.language)}: {formatValue(variable, sample.values[variable.key], i18n.language, booleans)}
        </Text>
      ))}
      <Text className="mt-3 text-xs text-muted">
        {t('dashboard.updatedAt', { time: new Date(sample.receivedAt).toLocaleTimeString(i18n.language) })}
      </Text>
    </>
  );
}
