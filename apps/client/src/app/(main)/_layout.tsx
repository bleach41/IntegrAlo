import { hasPermission } from '@integralo/contract';
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
 * bottom bar on phones or as a side bar on wide screens. Tabs that need a permission the
 * user lacks are not declared at all.
 */
function SignedIn() {
  useRealtime();
  const wide = useIsWide();
  const permissions = useSession((s) => s.user?.permissions ?? []);
  const tabs = TABS.filter((tab) => !tab.permission || hasPermission(permissions, tab.permission));
  const unacknowledged = (useOpenAlarms().data ?? []).filter((a) => a.ackedAt === null).length;

  return (
    // Tabs renders a plain View: without flex 1 its height is unbounded and screens cannot scroll.
    <Tabs style={{ flex: 1 }}>
      <View className={`flex-1 bg-canvas ${wide ? 'flex-row' : ''}`}>
        {wide ? <NavBar layout="side" alarmCount={unacknowledged} tabs={tabs} /> : null}
        <View className="flex-1">
          {/* Its default container grows with the content (flex 1 0 auto): the screen would
              be as tall as everything in it and never scroll. The home tab escaped this only
              because its own stack bounds the height. */}
          <TabSlot style={{ flex: 1, minHeight: 0 }} />
        </View>
        {wide ? null : <NavBar layout="bottom" alarmCount={unacknowledged} tabs={tabs} />}
      </View>
      <TabList style={{ display: 'none' }}>
        {tabs.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} />
        ))}
      </TabList>
    </Tabs>
  );
}
