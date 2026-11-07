import { Download } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SmallButton } from '@/components/ui';
import { useSession } from '@/features/auth/session.store';
import { useTheme } from '@/theme/ThemeProvider';
import { exportCsv } from './exportCsv';

/** "CSV" button of the trend section: exports the raw readings of the window on screen. */
export function CsvButton({ nodeId, windowMs }: { nodeId: string; windowMs: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const serverUrl = useSession((s) => s.serverUrl);
  const token = useSession((s) => s.token);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const press = async () => {
    if (!serverUrl || !token || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const to = Date.now();
      await exportCsv(serverUrl, token, nodeId, to - windowMs, to);
    } catch {
      setFailed(true);
      setTimeout(() => setFailed(false), 4000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SmallButton
      label={failed ? t('detail.csvFailed') : t('detail.csv')}
      tone={failed ? 'danger' : 'accent'}
      busy={busy}
      onPress={() => void press()}
      icon={<Download size={14} color={failed ? colors.danger : colors.accent} />}
    />
  );
}
