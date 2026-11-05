import { TelemetryValue, VariableDef, localize } from '@integralo/contract';

/**
 * Generic formatting driven by the module manifest (label, unit, decimals, enum labels).
 * It lets the app show any module's variables without code written for that module.
 */
export function variableLabel(variable: VariableDef, language: string): string {
  return localize(variable.label, language, variable.key);
}

export function formatValue(
  variable: VariableDef,
  value: TelemetryValue | undefined,
  language: string,
  booleans: { yes: string; no: string },
): string {
  if (value === undefined) return '—';
  switch (variable.type) {
    case 'number': {
      if (typeof value !== 'number') return String(value);
      const text = value.toLocaleString(language, {
        minimumFractionDigits: variable.decimals ?? 0,
        maximumFractionDigits: variable.decimals ?? 2,
      });
      return variable.unit ? `${text} ${variable.unit}` : text;
    }
    case 'enum':
      return localize(variable.valueLabels?.[String(value)], language, String(value));
    case 'boolean':
      return value ? booleans.yes : booleans.no;
  }
}
