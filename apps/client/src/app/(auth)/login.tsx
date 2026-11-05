import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { Brand, Button, Card, ErrorText, Field, Screen, Title } from '@/components/ui';
import { Message, loginError } from '@/features/auth/errors';
import { useSession } from '@/features/auth/session.store';

export default function LoginScreen() {
  const { t } = useTranslation();
  const serverUrl = useSession((s) => s.serverUrl);
  const needsSetup = useSession((s) => s.needsSetup);
  const login = useSession((s) => s.login);
  const forgetServer = useSession((s) => s.forgetServer);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);

  if (!serverUrl) return <Redirect href="/connect" />;
  if (needsSetup) return <Redirect href="/setup" />;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      router.replace('/');
    } catch (err) {
      setError(loginError(err));
    } finally {
      setBusy(false);
    }
  }

  async function changeServer() {
    await forgetServer();
    router.replace('/connect');
  }

  return (
    <Screen centered>
      <Brand />
      <Card>
        <Title>{t('login.title')}</Title>
        <ErrorText message={error} />
        <Field label={t('login.username')} value={username} onChangeText={setUsername} textContentType="username" />
        <Field
          label={t('login.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Button label={t('login.submit')} onPress={submit} busy={busy} />
      </Card>
      <Text className="mt-6 text-center text-xs text-muted">{t('connect.current', { url: serverUrl })}</Text>
      <Button label={t('connect.change')} onPress={changeServer} variant="ghost" />
    </Screen>
  );
}
