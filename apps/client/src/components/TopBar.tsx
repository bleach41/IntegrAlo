import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useRealtimeStatus } from '@/api/realtime';

/** Header of the main screens: title, real-time indicator and an optional action. */
export function TopBar({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View className="mb-6 flex-row items-center justify-between">
      <View>
        <Text className="text-2xl font-bold text-ink">{title}</Text>
        <RealtimeIndicator />
      </View>
      {action ? <HeaderButton onPress={action.onPress}>{action.label}</HeaderButton> : null}
    </View>
  );
}

export function HeaderButton({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="rounded-xl border border-line px-3 py-2 active:bg-line">
      <Text className="text-sm font-medium text-accent">{children}</Text>
    </Pressable>
  );
}

function RealtimeIndicator() {
  const { t } = useTranslation();
  const status = useRealtimeStatus((s) => s.status);
  const dot = { live: 'bg-accent', connecting: 'bg-warning', offline: 'bg-danger' }[status];
  return (
    <View className="mt-1 flex-row items-center">
      <View className={`mr-1.5 h-2 w-2 rounded-full ${dot}`} />
      <Text className="text-xs text-muted">{t(`realtime.${status}`)}</Text>
    </View>
  );
}
