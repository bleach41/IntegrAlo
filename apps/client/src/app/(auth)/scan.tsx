import { parsePairingPayload } from '@integralo/contract';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { BackButton } from '@/components/TopBar';
import { Button, Card, ErrorText, Screen } from '@/components/ui';
import { ApiError, apiRequest, normalizeServerUrl } from '@/api/client';
import { Message, connectionError } from '@/features/auth/errors';
import { useSession } from '@/features/auth/session.store';
import { cameraUnavailableReason } from '@/features/pairing/qrReader';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Pairing by QR: the code printed by the server (supervisor console) carries the server's public
 * key and its addresses. The app tries each address, requires the server to prove that key
 * (signature) and keeps it, so from then on only that server is trusted.
 */
export default function ScanScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const connect = useSession((s) => s.connect);
  const [error, setError] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  // Web: the browser may not give the camera at all (page opened by a network address over
  // HTTP); then the screen says so instead of asking for a permission that cannot be granted.
  const noCamera = cameraUnavailableReason();
  // The camera reports the same code many times per second: handle one at a time.
  const handling = useRef(false);

  async function onScanned(data: string) {
    if (handling.current) return;
    handling.current = true;
    const payload = parsePairingPayload(data);
    if (!payload) {
      setError({ key: 'scan.notIntegralo' });
      setTimeout(() => (handling.current = false), 1500);
      return;
    }
    setBusy(true);
    setError(null);
    // The core lists every address it has (Wi-Fi, cable, VPN…): ask them all at once and
    // use the first that answers, instead of waiting for the unreachable ones in turn.
    const reachable = await firstReachable(payload.addresses);
    let lastError: unknown = new ApiError(0, 'unreachable');
    for (const address of reachable ? [reachable] : []) {
      try {
        await connect(address, { publicKey: payload.publicKey, name: payload.name });
        router.replace(useSession.getState().needsSetup ? '/setup' : '/login');
        return;
      } catch (err) {
        lastError = err;
      }
    }
    setError(connectionError(lastError));
    setBusy(false);
    setTimeout(() => (handling.current = false), 1500);
  }

  return (
    <Screen>
      <BackButton label={t('common.back')} onPress={() => router.back()} />
      <Card>
        <Text className="mb-1 text-xl font-semibold text-ink">{t('scan.title')}</Text>
        <Text className="mb-4 text-sm leading-5 text-muted">{t('scan.hint')}</Text>
        <ErrorText message={error} />
        {noCamera ? (
          <>
            <Text className="mb-4 text-sm leading-5 text-muted">{t(noCamera === 'insecure' ? 'scan.insecure' : 'scan.noCamera')}</Text>
            <Button label={t('common.back')} onPress={() => router.back()} />
          </>
        ) : !permission ? (
          <ActivityIndicator color={colors.accent} />
        ) : !permission.granted ? (
          <>
            <Text className="mb-2 text-sm text-muted">{t('scan.permission')}</Text>
            <Button label={t('scan.allow')} onPress={() => void requestPermission()} />
          </>
        ) : (
          <View className="overflow-hidden rounded-2xl border border-line" style={{ aspectRatio: 1 }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={busy ? undefined : ({ data }) => void onScanned(data)}
            />
            {busy ? (
              <View className="absolute inset-0 items-center justify-center bg-black/50">
                <ActivityIndicator color="#ffffff" />
                <Text className="mt-2 text-sm text-white">{t('scan.verifying')}</Text>
              </View>
            ) : null}
          </View>
        )}
      </Card>
    </Screen>
  );
}

/** First address whose /api/health answers, all asked at the same time; null if none does. */
function firstReachable(addresses: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let pending = addresses.length;
    if (pending === 0) resolve(null);
    for (const address of addresses) {
      apiRequest(normalizeServerUrl(address), 'GET', '/health')
        .then(() => resolve(address))
        .catch(() => {
          pending -= 1;
          if (pending === 0) resolve(null);
        });
    }
  });
}
