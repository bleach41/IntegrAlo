import { localize, type CommandDef, type CommandFieldDef, type TelemetryValue } from '@integralo/contract';

/** A field's value as the user reads it: the label of a choice, or the number with its unit. */
export function fieldValue(field: CommandFieldDef | undefined, value: TelemetryValue, lang: string): string {
  if (field?.type === 'enum' && typeof value === 'string') return localize(field.valueLabels?.[value], lang, value);
  if (typeof value === 'number') {
    const unit = field?.type === 'number' && field.unit ? ` ${field.unit}` : '';
    return `${value.toLocaleString(lang, { maximumFractionDigits: 3 })}${unit}`;
  }
  return String(value);
}

/**
 * One line with the values the node holds for a command's fields, for the header of a folded
 * form: "Todo/nada · Histéresis 0,5 °C · Encendido mínimo 60 s". A choice is shown by its value
 * alone; fields the node has not reported are left out.
 */
export function commandSummary(command: CommandDef, known: Record<string, TelemetryValue> | null | undefined, lang: string): string {
  if (!known) return '';
  return Object.entries(command.fields)
    .filter(([name]) => known[name] !== undefined)
    .map(([name, field]) => {
      const value = fieldValue(field, known[name], lang);
      return field.type === 'enum' ? value : `${localize(field.label, lang, name)} ${value}`;
    })
    .join(' · ');
}
