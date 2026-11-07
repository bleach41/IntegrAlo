import { CommandDef, CommandFieldDef, ModuleManifest, TelemetryValue, localize } from '@integralo/contract';
import { Send } from 'lucide-react-native';
import { ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useCommand, useSendCommand } from '@/api/queries';
import { Segmented, SmallButton } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { CommandStatus } from './CommandStatus';
import { ArcDial, SliderBar } from './DragControls';

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

  const submit = (payload: Record<string, unknown>) => {
    // Forget the previous command at once: its outcome must not be read as this one's.
    setCommandId(undefined);
    send.mutate({ type: command.type, payload }, { onSuccess: (r) => setCommandId(r.id) });
  };

  // The node's answer: each layout places it where the eye already is (under the value).
  const status = (align: 'left' | 'center') => (
    <CommandStatus
      commandId={locked ? undefined : commandId}
      failed={!locked && send.isError}
      hint={locked && when ? t('commands.onlyWhen', { values: valueNames(manifest, when.variable, when.values, i18n.language) }) : undefined}
      align={align}
    />
  );

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
          failed={send.isError || record?.status === 'rejected' || record?.status === 'unconfirmed'}
          onSubmit={submit}
          status={status}
        />
      ) : (
        <>
          <MultiFieldForm fields={fields} disabled={disabled || locked} busy={waiting} onSubmit={submit} />
          <View className="mt-2">{status('left')}</View>
        </>
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
  failed,
  onSubmit,
  status,
}: FieldProps & {
  name: string;
  field: CommandFieldDef;
  current?: TelemetryValue;
  failed: boolean;
  /** The node's answer, drawn by the form; placed here under the value. */
  status: (align: 'left' | 'center') => ReactNode;
}) {
  const { t, i18n } = useTranslation();
  // Until the user edits it, the stepper follows the live value (which may arrive after mounting).
  const [edited, setEdited] = useState<number | undefined>();
  const live = typeof current === 'number' ? current : undefined;
  // The sent value stays on screen from the press until a reading reports it, instead of the old
  // value flashing back while the node answers. It is kept here, at the press, and not read back
  // from the request library: right after the press that one still holds the previous command
  // for a moment, and comparing against it released the new value too early. If the command
  // fails (rejected, unconfirmed, not sent) the control goes back to what the node reports; a
  // failure only counts once this command has been under way, so the previous command's outcome
  // cannot release it. Once reported, the control follows the node again.
  const [target, setTarget] = useState<{ value: TelemetryValue; started: boolean } | null>(null);
  useEffect(() => {
    if (!target) return;
    if (current === target.value) setTarget(null);
    else if (busy && !target.started) setTarget({ ...target, started: true });
    else if (target.started && !busy && failed) setTarget(null);
  }, [target, current, busy, failed]);
  // Confirmed but never reported as such (a node that rounds the value): stop waiting after a while.
  const settled = target !== null && target.started && !busy;
  useEffect(() => {
    if (!settled) return;
    const timer = setTimeout(() => setTarget(null), 5000);
    return () => clearTimeout(timer);
  }, [settled]);
  const submit = (payload: Record<string, unknown>) => {
    setTarget({ value: payload[name] as TelemetryValue, started: false });
    onSubmit(payload);
  };

  if (field.type === 'enum') {
    // The pressed option is shown at once, with a spinner while the node has not answered.
    const choice = typeof target?.value === 'string' ? target.value : undefined;
    const showChoice = choice !== undefined;
    return (
      <View>
        <Segmented
          value={showChoice ? choice : typeof current === 'string' ? current : ''}
          busyValue={busy ? choice : undefined}
          disabled={disabled}
          options={field.values.map((v) => ({ value: v, label: localize(field.valueLabels?.[v], i18n.language, v) }))}
          onChange={(v) => !disabled && !busy && v !== current && submit({ [name]: v })}
        />
        <View className="mt-2">{status('left')}</View>
      </View>
    );
  }

  const step = field.step ?? 1;
  const clamp = (v: number) => Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, v));
  const pending = typeof target?.value === 'number' ? target.value : undefined;
  const shown = edited ?? pending ?? live ?? field.min ?? 0;
  const decimals = (String(step).split('.')[1] ?? '').length;

  const text = (v: number) => `${v.toLocaleString(i18n.language, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${field.unit ? ` ${field.unit}` : ''}`;
  const minus = <StepButton label="−" disabled={disabled} onPress={() => setEdited(clamp(round(shown - step, decimals)))} />;
  const plus = <StepButton label="+" disabled={disabled} onPress={() => setEdited(clamp(round(shown + step, decimals)))} />;
  const sendButton = (
    <SendButton
      busy={busy}
      disabled={disabled}
      onPress={() => {
        if (disabled) return;
        submit({ [name]: shown });
        setEdited(undefined); // shows the sent value until the node reports it (see `pending`)
      }}
    />
  );
  // While a new value is being chosen, the one the node has now stays in view for comparison.
  const reported = live !== undefined && live !== shown ? t('commands.current', { value: text(live) }) : ' ';
  const drag = field.min !== undefined && field.max !== undefined ? field.control : undefined;

  if (drag === 'arc' && field.min !== undefined && field.max !== undefined) {
    return (
      <View>
        <ArcDial value={shown} min={field.min} max={field.max} step={step} disabled={disabled} onChange={setEdited}>
          <Text className={`text-3xl font-semibold ${disabled ? 'text-muted' : 'text-ink'}`}>{text(shown)}</Text>
          <Text className="mt-0.5 text-xs text-muted">{reported}</Text>
          <View className="mt-1 self-stretch">{status('center')}</View>
        </ArcDial>
        <View className="mt-3 flex-row items-center justify-center">
          {minus}
          <View className="w-3" />
          {plus}
          <View className="ml-4">{sendButton}</View>
        </View>
      </View>
    );
  }

  if (drag === 'slider' && field.min !== undefined && field.max !== undefined) {
    return (
      <View>
        <View className="mb-1 flex-row items-baseline">
          <Text className={`text-2xl font-semibold ${disabled ? 'text-muted' : 'text-ink'}`}>{text(shown)}</Text>
          <Text className="ml-2 flex-1 text-xs text-muted">{reported}</Text>
        </View>
        <View className="mb-1">{status('left')}</View>
        <SliderBar value={shown} min={field.min} max={field.max} step={step} disabled={disabled} onChange={setEdited} />
        <View className="mt-2 flex-row items-center justify-center">
          {minus}
          <View className="w-3" />
          {plus}
          <View className="ml-4">{sendButton}</View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row flex-wrap items-center">
      {minus}
      <Text className={`mx-3 min-w-24 text-center text-2xl font-semibold ${disabled ? 'text-muted' : 'text-ink'}`}>{text(shown)}</Text>
      {plus}
      <View className="ml-auto">{sendButton}</View>
      <View className="mt-2 w-full">{status('left')}</View>
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
