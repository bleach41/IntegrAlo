import { router } from 'expo-router';
import { QrCode, Radar, ShieldAlert, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Brand, Button, Card, ErrorText, Field, Screen, SmallButton, Title } from '@/components/ui';
import { Message, connectionError } from '@/features/auth/errors';
import { useSession } from '@/features/auth/session.store';
import { FoundServer, scanLocalNetwork } from '@/features/pairing/discovery';
import { useTheme } from '@/theme/ThemeProvider';

/** Search results change the height of the card: it grows (or shrinks) in this time instead of jumping. */
const GROW_MS = 220;
/** A search on this computer alone ends in a few ms: below this the spinner would just flicker. */
const MIN_SEARCH_MS = 600;

/**
 * How the app finds its server, from the most to the least convenient: scanning the
 * pairing QR, searching the local network, or typing the address. Whatever the path, the
 * server must prove its identity before the app trusts it.
 */
export default function ConnectScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const connect = useSession((s) => s.connect);
  const paired = useSession((s) => s.paired);
  const identityAlert = useSession((s) => s.identityAlert);
  const forgetPairing = useSession((s) => s.forgetPairing);
  const phone = Platform.OS !== 'web';
  // On the web the app is normally served by the core itself: propose the host it came from
  // (the default port 4100 is added when connecting).
  const [address, setAddress] = useState(phone ? '' : (globalThis.location?.hostname ?? 'localhost'));
  const [error, setError] = useState<Message | null>(identityAlert ? { key: 'connect.identityMismatch' } : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<FoundServer[] | null>(null);

  async function connectTo(target: string) {
    setBusy(target);
    setError(null);
    try {
      await connect(target);
      router.replace(useSession.getState().needsSetup ? '/setup' : '/login');
    } catch (err) {
      setError(connectionError(err));
    } finally {
      setBusy(null);
    }
  }

  async function search() {
    setSearching(true);
    setError(null);
    setFound([]);
    const started = Date.now();
    try {
      const servers = await scanLocalNetwork((s) => setFound((list) => [...(list ?? []), s]));
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, MIN_SEARCH_MS - (Date.now() - started))));
      setFound(servers);
    } catch {
      setError({ key: 'connect.noNetwork' });
      setFound(null);
    } finally {
      setSearching(false);
    }
  }

  return (
    <Screen centered>
      <Brand />
      <Card>
        <Title subtitle={t('connect.subtitle')}>{t('connect.title')}</Title>
        <ErrorText message={error} />

        {paired ? (
          <View className="mb-4 flex-row items-center rounded-xl border border-line px-3 py-2.5">
            {identityAlert ? <ShieldAlert size={18} color={colors.danger} /> : <ShieldCheck size={18} color={colors.accent} />}
            <View className="ml-2.5 flex-1">
              <Text className="text-sm font-medium text-ink">{t('connect.pairedWith', { name: paired.name || '—' })}</Text>
              <Text className="text-xs text-muted">{t('connect.pairedHint')}</Text>
            </View>
            <SmallButton tone="warning" label={t('connect.forget')} onPress={() => void forgetPairing()} />
          </View>
        ) : null}

        {/* The three ways, on the phone and on the web (where the QR needs a camera the browser
              allows: see the scan screen). */}
        <Option icon={<QrCode size={20} color={colors.accent} />} title={t('connect.scan')} hint={t('connect.scanHint')} onPress={() => router.push('/scan')} />
        <Option
          icon={searching ? <ActivityIndicator color={colors.accent} /> : <Radar size={20} color={colors.accent} />}
          title={searching ? t('connect.searching') : t('connect.search')}
          hint={t('connect.searchHint')}
          onPress={searching ? undefined : () => void search()}
        />
        {/* Shown only when it has something to show (an empty list would already push the rest
              down by its margin), inside a space that grows smoothly to fit it. */}
        <GrowingSpace>
          {found !== null && (found.length > 0 || !searching) ? (
            <View className="mb-3">
              {found.length === 0 ? <Text className="px-1 text-xs text-muted">{t('connect.noneFound')}</Text> : null}
              {found.map((server) => {
                const trusted = paired?.publicKey === server.health.publicKey;
                return (
                  <Animated.View key={server.address} entering={FadeIn.duration(180)}>
                    <Pressable
                      onPress={() => void connectTo(server.address)}
                      accessibilityRole="button"
                      className="mb-2 flex-row items-center rounded-xl border border-line px-3 py-2.5 active:bg-line"
                    >
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-ink">{server.health.name}</Text>
                        <Text className="text-xs text-muted">
                          {server.address} · {server.health.serverId}
                        </Text>
                      </View>
                      {busy === server.address ? (
                        <ActivityIndicator color={colors.accent} />
                      ) : trusted ? (
                        <Text className="text-xs font-medium text-accent">{t('connect.paired')}</Text>
                      ) : null}
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          ) : null}
        </GrowingSpace>

        <Text className="mb-2 mt-1 text-xs uppercase tracking-wide text-muted">{t('connect.orType')}</Text>
        <Field
          label={t('connect.address')}
          hint={t('connect.addressHint')}
          value={address}
          onChangeText={setAddress}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={() => void connectTo(address)}
        />
        <Button label={t('connect.connect')} onPress={() => void connectTo(address)} busy={busy === address} />
      </Card>
    </Screen>
  );
}

/**
 * A space whose height follows its content smoothly: the content is laid out at its natural
 * height (absolutely positioned) and the space animates to it, so whatever is below slides.
 */
function GrowingSpace({ children }: { children: React.ReactNode }) {
  const height = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ height: height.value }));
  return (
    <Animated.View style={[{ overflow: 'hidden' }, style]}>
      <View
        style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
        onLayout={(e) => {
          height.value = withTiming(e.nativeEvent.layout.height, {
            duration: GROW_MS,
          });
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

function Option({ icon, title, hint, onPress }: { icon: React.ReactNode; title: string; hint: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="mb-3 flex-row items-center rounded-xl border border-line px-3 py-3 active:bg-line">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent/15">{icon}</View>
      <View className="ml-3 flex-1">
        <Text className="text-base font-semibold text-ink">{title}</Text>
        <Text className="text-xs text-muted">{hint}</Text>
      </View>
    </Pressable>
  );
}
