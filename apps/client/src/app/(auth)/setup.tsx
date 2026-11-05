import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Brand, Button, Card, ErrorText, Field, Screen, Title } from '@/components/ui';
import { setupError, validateNewAccount } from '@/features/auth/errors';
import { useSession } from '@/features/auth/session.store';
import { t } from '@/i18n/es';

/** First-run assistant: only reachable while the server has no users. */
export default function SetupScreen() {
  const serverUrl = useSession((s) => s.serverUrl);
  const needsSetup = useSession((s) => s.needsSetup);
  const setup = useSession((s) => s.setup);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!serverUrl) return <Redirect href="/connect" />;
  if (!needsSetup) return <Redirect href="/login" />;

  async function submit() {
    const invalid = validateNewAccount(username, password, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setup(username, password);
      router.replace('/');
    } catch (err) {
      setError(setupError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen centered>
      <Brand />
      <Card>
        <Title subtitle={t('setup.subtitle')}>{t('setup.title')}</Title>
        <ErrorText message={error} />
        <Field label={t('setup.username')} value={username} onChangeText={setUsername} textContentType="username" />
        <Field label={t('setup.password')} value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" />
        <Field
          label={t('setup.confirm')}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Button label={t('setup.create')} onPress={submit} busy={busy} />
      </Card>
    </Screen>
  );
}
