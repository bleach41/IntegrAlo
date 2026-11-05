import { localize } from '@integralo/contract';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import type { VisualProps } from './types';

/**
 * Text line under every synoptic. The state is always written in words, so colour is
 * never the only cue (ISA-101, accessibility); active alarms are appended by name.
 */
export function Readout({ parts, manifest, alarms }: { parts: string[] } & Pick<VisualProps, 'manifest' | 'alarms'>) {
  const { t, i18n } = useTranslation();
  const active = alarms.filter((a) => a.state === 'active' || a.state === 'acknowledged');
  const alarmParts = active.map((a) => {
    const name = a.key === 'commLoss' ? t('alarms.commLoss') : localize(manifest.alarms.find((d) => d.key === a.key)?.label, i18n.language, a.key);
    return t('visual.alarm', { name: name.toLowerCase() });
  });
  return (
    <Text className={`mt-2 text-center text-sm font-medium ${active.length > 0 ? 'text-warning' : 'text-ink'}`}>
      {[...parts, ...alarmParts].join(' · ')}
    </Text>
  );
}
