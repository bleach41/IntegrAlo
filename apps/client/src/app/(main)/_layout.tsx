import { Redirect } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { View } from 'react-native';
import { useOpenAlarms } from '@/api/queries';
import { useRealtime } from '@/api/realtime';
import { useIsWide } from '@/components/layout';
import { NavBar, TABS } from '@/components/NavBar';
import { useSession } from '@/features/auth/session.store';

/** Main area: requires a server, a completed setup and a signed-in user. */
export default function MainLayout() {
  const { serverUrl, needsSetup, user } = useSession();
  if (!serverUrl) return <Redirect href="/connect" />;
  if (needsSetup) return <Redirect href="/setup" />;
  if (!user) return <Redirect href="/login" />;
  return <SignedIn />;
}

/**
 * Tab navigation built with Expo Router's headless tabs (experimental API, isolated here):
 * the real TabList is hidden and only declares the routes; NavBar draws the same tabs as a
 * bottom bar on phones or as a side bar on wide screens.
 */
function SignedIn() {
  useRealtime();
  const wide = useIsWide();
  const unacknowledged = (useOpenAlarms().data ?? []).filter((a) => a.ackedAt === null).length;

  return (
    // Tabs renders a plain View: without flex 1 its height is unbounded and screens cannot scroll.
    <Tabs style={{ flex: 1 }}>
      <View className={`flex-1 bg-canvas ${wide ? 'flex-row' : ''}`}>
        {wide ? <NavBar layout="side" alarmCount={unacknowledged} /> : null}
        <View className="flex-1">
          <TabSlot />
        </View>
        {wide ? null : <NavBar layout="bottom" alarmCount={unacknowledged} />}
      </View>
      <TabList style={{ display: 'none' }}>
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} />
        ))}
      </TabList>
    </Tabs>
  );
}
