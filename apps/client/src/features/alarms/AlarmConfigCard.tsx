import { ModuleManifest, localize } from '@integralo/contract';
import { Save } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TextInput, View } from 'react-native';
import { AlarmConfig, useAlarmConfigs, useSaveAlarmConfig } from '@/api/queries';
import { Segmented, SmallButton } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

/** Per-node alarm thresholds, deadband and on-delay (engineering, RF-05). */
export function AlarmConfigCard({ nodeId, manifest }: { nodeId: string; manifest: ModuleManifest }) {
  const { t } = useTranslation();
  const configs = useAlarmConfigs(nodeId).data ?? [];
  if (configs.length === 0) return null;
  return (
    <View>
      <Text className="mb-4 text-xs leading-5 text-muted">{t('alarmConfig.hint')}</Text>
      {configs.map((config) => (
        <AlarmConfigRow key={config.key} nodeId={nodeId} manifest={manifest} config={config} />
      ))}
    </View>
  );
}

function AlarmConfigRow({ nodeId, manifest, config }: { nodeId: string; manifest: ModuleManifest; config: AlarmConfig }) {
  const { t, i18n } = useTranslation();
  const save = useSaveAlarmConfig(nodeId);
  const [threshold, setThreshold] = useState(String(config.threshold));
  const [deadband, setDeadband] = useState(String(config.deadband));
  const [delay, setDelay] = useState(String(config.delayS));
  const [enabled, setEnabled] = useState(config.enabled);
  const [invalid, setInvalid] = useState(false);

  const definition = manifest.alarms.find((a) => a.key === config.key);
  const unit = (() => {
    const variable = manifest.variables.find((v) => v.key === config.variable);
    return variable?.type === 'number' ? variable.unit : undefined;
  })();

  function submit() {
    const values = [threshold, deadband, delay].map((v) => Number(v.replace(',', '.')));
    const [th, db, dl] = values;
    if (values.some((v) => !Number.isFinite(v)) || db < 0 || dl < 0) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    save.mutate({ key: config.key, changes: { threshold: th, deadband: db, delayS: dl, enabled } });
  }

  return (
    <View className="mb-4 rounded-xl border border-line p-3">
      <Text className="mb-3 text-sm font-semibold text-ink">
        {localize(definition?.label, i18n.language, config.key)}
        <Text className="font-normal text-muted">{config.type === 'high' ? '  ▲' : '  ▼'}</Text>
      </Text>
      <Segmented
        value={enabled ? 'on' : 'off'}
        options={[
          { value: 'on', label: t('alarmConfig.enabled') },
          { value: 'off', label: t('alarmConfig.disabled') },
        ]}
        onChange={(v) => setEnabled(v === 'on')}
      />
      <View className="-mx-1 mt-3 flex-row">
        <NumberInput label={`${t('alarmConfig.threshold')}${unit ? ` (${unit})` : ''}`} value={threshold} onChange={setThreshold} />
        <NumberInput label={`${t('alarmConfig.deadband')}${unit ? ` (${unit})` : ''}`} value={deadband} onChange={setDeadband} />
        <NumberInput label={t('alarmConfig.delay')} value={delay} onChange={setDelay} />
      </View>
      <View className="mt-2 flex-row items-center justify-end">
        {invalid ? <Text className="mr-3 flex-1 text-xs text-warning">{t('alarmConfig.invalid')}</Text> : null}
        {save.isSuccess && !invalid ? <Text className="mr-3 text-xs text-accent">{t('alarmConfig.saved')}</Text> : null}
        {save.isError ? <Text className="mr-3 flex-1 text-xs text-danger">{t('common.unexpectedError')}</Text> : null}
        <SaveButton busy={save.isPending} onPress={submit} />
      </View>
    </View>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { colors } = useTheme();
  return (
    <View className="flex-1 px-1">
      <Text className="mb-1 text-xs text-muted" numberOfLines={1}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.muted}
        className="rounded-lg border border-line bg-canvas px-3 py-2 text-base text-ink"
      />
    </View>
  );
}

function SaveButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return <SmallButton label={t('alarmConfig.save')} busy={busy} onPress={onPress} icon={<Save size={14} color={colors.accent} />} />;
}
