import { CommandDef, CommandFieldDef, ModuleManifest, TelemetryValue, localize } from '@integralo/contract';
import { Send } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useCommand, useSendCommand } from '@/api/queries';
import { Segmented, SmallButton } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { CommandStatus } from './CommandStatus';

interface Props {
  nodeId: string;
  command: CommandDef;
  /** Module manifest: names the values in the "only in … mode" hint. */
  manifest?: ModuleManifest;
  /** Latest telemetry: a field named like a variable (setpoint, mode) starts from its value. */
  current: Record<string, TelemetryValue>;
  disabled: boolean;
}

/**
 * Form generated from a command declared in the module manifest. Three layouts:
 * - a single choice (mode): sent as soon as an option is pressed;
 * - a single number (setpoint): − / + stepper and a send button;
 * - several fields (control parameters): only the changed fields are sent.
 * A command with `enabledWhen` (the pump, in manual mode only) is shown disabled, with
 * the reason, while the condition does not hold.
 */
export function CommandForm({ nodeId, command, manifest, current, disabled }: Props) {
  const { t, i18n } = useTranslation();
  const send = useSendCommand(nodeId);
  const [commandId, setCommandId] = useState<string>();
  const record = useCommand(commandId).data;
  const fields = Object.entries(command.fields);
  const title = localize(command.label, i18n.language, command.type);

  const when = command.enabledWhen;
  const locked = when !== undefined && !when.values.includes(String(current[when.variable]));
  const waiting = send.isPending || record?.status === 'sent';

  const submit = (payload: Record<string, unknown>) =>
    send.mutate({ type: command.type, payload }, { onSuccess: (r) => setCommandId(r.id) });

  return (
    <View className="mb-5">
      <Text className={`mb-2 text-sm font-medium ${locked ? 'text-muted' : 'text-ink'}`}>{title}</Text>
      {fields.length === 1 && !command.partial ? (
        <SingleField
          name={fields[0][0]}
          field={fields[0][1]}
          current={current[fields[0][0]]}
          disabled={disabled || locked}
          busy={waiting}
          sent={send.variables?.payload[fields[0][0]]}
          confirmed={record?.status === 'confirmed'}
          onSubmit={submit}
        />
      ) : (
        <MultiFieldForm fields={fields} disabled={disabled || locked} busy={waiting} onSubmit={submit} />
      )}
      {locked && when ? (
        <Text className="mt-2 text-xs text-muted">{t('commands.onlyWhen', { values: valueNames(manifest, when.variable, when.values, i18n.language) })}</Text>
      ) : (
        <CommandStatus commandId={commandId} failed={send.isError} />
      )}
    </View>
  );
}

/** "Manual", "Manual / Automático": the labels the manifest gives those values. */
function valueNames(manifest: ModuleManifest | undefined, variable: string, values: string[], lang: string): string {
  const def = manifest?.variables.find((v) => v.key === variable);
  return values.map((v) => (def?.type === 'enum' ? localize(def.valueLabels?.[v], lang, v) : v)).join(' / ');
}

interface FieldProps {
  disabled: boolean;
  busy: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}

function SingleField({
  name,
  field,
  current,
  disabled,
  busy,
  sent,
  confirmed,
  onSubmit,
}: FieldProps & { name: string; field: CommandFieldDef; current?: TelemetryValue; sent?: unknown; confirmed: boolean }) {
  const { i18n } = useTranslation();
  // Until the user edits it, the stepper follows the live value (which may arrive after mounting).
  const [edited, setEdited] = useState<number | undefined>();
  const live = typeof current === 'number' ? current : undefined;

  if (field.type === 'enum') {
    // The pressed option is shown at once: with a spinner while the node has not answered,
    // and, once confirmed, until the next reading reports it. A rejected or unconfirmed
    // command goes back to what the node actually reports.
    const choice = typeof sent === 'string' ? sent : undefined;
    const showChoice = choice !== undefined && (busy || (confirmed && current !== choice));
    return (
      <Segmented
        value={showChoice ? choice : typeof current === 'string' ? current : ''}
        busyValue={busy ? choice : undefined}
        disabled={disabled}
        options={field.values.map((v) => ({ value: v, label: localize(field.valueLabels?.[v], i18n.language, v) }))}
        onChange={(v) => !disabled && !busy && v !== current && onSubmit({ [name]: v })}
      />
    );
  }

  const step = field.step ?? 1;
  const clamp = (v: number) => Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, v));
  const shown = edited ?? live ?? field.min ?? 0;
  const decimals = (String(step).split('.')[1] ?? '').length;

  return (
    <View className="flex-row items-center">
      <StepButton label="−" disabled={disabled} onPress={() => setEdited(clamp(round(shown - step, decimals)))} />
      <Text className={`mx-3 min-w-24 text-center text-2xl font-semibold ${disabled ? 'text-muted' : 'text-ink'}`}>
        {shown.toLocaleString(i18n.language, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
        {field.unit ? ` ${field.unit}` : ''}
      </Text>
      <StepButton label="+" disabled={disabled} onPress={() => setEdited(clamp(round(shown + step, decimals)))} />
      <View className="ml-auto">
        <SendButton
          busy={busy}
          disabled={disabled}
          onPress={() => {
            if (disabled) return;
            onSubmit({ [name]: shown });
            setEdited(undefined); // follow the live value again; the confirmed value will arrive with the telemetry
          }}
        />
      </View>
    </View>
  );
}

function MultiFieldForm({ fields, disabled, busy, onSubmit }: FieldProps & { fields: Array<[string, CommandFieldDef]> }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});
  const [empty, setEmpty] = useState(false);

  function submit() {
    const payload: Record<string, unknown> = {};
    for (const [name, field] of fields) {
      const raw = values[name];
      if (raw === undefined || raw === '') continue;
      payload[name] = field.type === 'number' ? Number(raw.replace(',', '.')) : raw;
    }
    setEmpty(Object.keys(payload).length === 0);
    if (Object.keys(payload).length > 0 && !disabled) onSubmit(payload);
  }

  return (
    <View className="rounded-xl border border-line p-3">
      {fields.map(([name, field]) => (
        <View key={name} className="mb-3">
          <Text className="mb-1 text-xs text-muted">
            {localize(field.label, i18n.language, name)}
            {field.type === 'number' && field.unit ? ` (${field.unit})` : ''}
          </Text>
          {field.type === 'enum' ? (
            <Segmented
              value={values[name] ?? ''}
              options={field.values.map((v) => ({ value: v, label: localize(field.valueLabels?.[v], i18n.language, v) }))}
              onChange={(v) => setValues((s) => ({ ...s, [name]: v }))}
            />
          ) : (
            <TextInput
              value={values[name] ?? ''}
              onChangeText={(text) => setValues((s) => ({ ...s, [name]: text }))}
              keyboardType="decimal-pad"
              placeholder={rangeHint(field.min, field.max)}
              placeholderTextColor={colors.muted}
              className="rounded-lg border border-line bg-canvas px-3 py-2 text-base text-ink"
            />
          )}
        </View>
      ))}
      <View className="flex-row items-center justify-end">
        {empty ? <Text className="mr-3 flex-1 text-xs text-warning">{t('commands.nothingToSend')}</Text> : null}
        <SendButton busy={busy} disabled={disabled} onPress={submit} />
      </View>
    </View>
  );
}

function SendButton({ busy, disabled, onPress }: { busy: boolean; disabled: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return <SmallButton label={t('commands.send')} busy={busy} disabled={disabled} onPress={onPress} icon={<Send size={14} color={colors.accent} />} />;
}

function StepButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={`h-11 w-11 items-center justify-center rounded-xl border border-line bg-canvas ${disabled ? 'opacity-40' : 'active:bg-line'}`}
    >
      <Text className="text-xl font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}

/** "0 – 1800", "≥ 0", "≤ 5" or nothing, from the field limits. */
function rangeHint(min?: number, max?: number): string {
  if (min !== undefined && max !== undefined) return `${min} – ${max}`;
  if (min !== undefined) return `≥ ${min}`;
  if (max !== undefined) return `≤ ${max}`;
  return '';
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
