import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { Brand, Button, Card, ErrorText, Field, Screen, Title } from '@/components/ui';
import { Message, connectionError } from '@/features/auth/errors';
import { useSession } from '@/features/auth/session.store';

export default function ConnectScreen() {
  const { t } = useTranslation();
  const connect = useSession((s) => s.connect);
  // On the web the client is usually opened on the server itself.
  const [address, setAddress] = useState(Platform.OS === 'web' ? 'localhost' : '');
  const [error, setError] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await connect(address);
      router.replace(useSession.getState().needsSetup ? '/setup' : '/login');
    } catch (err) {
      setError(connectionError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen centered>
      <Brand />
      <Card>
        <Title subtitle={t('connect.subtitle')}>{t('connect.title')}</Title>
        <ErrorText message={error} />
        <Field
          label={t('connect.address')}
          hint={t('connect.addressHint')}
          value={address}
          onChangeText={setAddress}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Button label={t('connect.connect')} onPress={submit} busy={busy} />
      </Card>
    </Screen>
  );
}
