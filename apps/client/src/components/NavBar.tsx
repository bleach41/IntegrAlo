import { PERMISSIONS } from '@integralo/contract';
import { Bell, House, LucideIcon, ScrollText, Settings } from 'lucide-react-native';
import { TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Brand } from './ui';

export interface TabDef {
  name: string;
  href: '/' | '/alarms' | '/audit' | '/settings';
  icon: LucideIcon;
  label: 'nav.home' | 'nav.alarms' | 'nav.audit' | 'nav.settings';
  /** Shown only to users with this permission. */
  permission?: string;
}

/** Tabs of the main area: name, route and icon. The same list feeds both layouts. */
export const TABS: TabDef[] = [
  { name: 'home', href: '/', icon: House, label: 'nav.home' },
  { name: 'alarms', href: '/alarms', icon: Bell, label: 'nav.alarms' },
  { name: 'audit', href: '/audit', icon: ScrollText, label: 'nav.audit', permission: PERMISSIONS.eventsRead },
  { name: 'settings', href: '/settings', icon: Settings, label: 'nav.settings' },
];

interface ItemProps extends TabTriggerSlotProps {
  icon: LucideIcon;
  label: string;
  badge?: number;
  layout: 'bottom' | 'side';
}

/** Tab button; TabTrigger passes isFocused and the press handlers through asChild. */
function NavItem({ icon: Icon, label, badge, layout, isFocused, onPress, onLongPress }: ItemProps) {
  const { colors } = useTheme();
  const color = isFocused ? colors.accent : colors.muted;
  const side = layout === 'side';
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      className={
        side
          ? `mb-1 flex-row items-center rounded-xl px-3 py-2.5 ${isFocused ? 'bg-accent/15' : 'active:bg-line'}`
          : 'flex-1 items-center pb-1 pt-2 active:opacity-70'
      }
    >
      <View>
        <Icon color={color} size={side ? 20 : 22} strokeWidth={isFocused ? 2.4 : 2} />
        {badge ? (
          <View className="absolute -right-2 -top-1.5 min-w-4 items-center rounded-full bg-danger px-1">
            <Text className="text-[10px] font-bold text-white">{badge > 9 ? '9+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text
        className={side ? `ml-3 text-sm font-medium ${isFocused ? 'text-accent' : 'text-ink'}` : 'mt-0.5 text-[11px] font-medium'}
        style={side ? undefined : { color }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Bottom tab bar (phones) or side bar (wide screens) with the same tabs. */
export function NavBar({ layout, alarmCount, tabs }: { layout: 'bottom' | 'side'; alarmCount: number; tabs: TabDef[] }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const items = tabs.map((tab) => (
    <TabTrigger key={tab.name} name={tab.name} asChild>
      <NavItem icon={tab.icon} label={t(tab.label)} layout={layout} badge={tab.name === 'alarms' ? alarmCount : undefined} />
    </TabTrigger>
  ));

  if (layout === 'side') {
    return (
      <View className="w-60 border-r border-line bg-surface px-3 pt-8" style={{ paddingTop: insets.top + 24 }}>
        <View className="mb-6 items-start px-2">
          <Brand compact />
        </View>
        {items}
      </View>
    );
  }
  return (
    <View className="flex-row border-t border-line bg-surface" style={{ paddingBottom: Math.max(insets.bottom, 6) }}>
      {items}
    </View>
  );
}
