import { ChevronLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useRealtimeStatus } from '@/api/realtime';
import { useTheme } from '@/theme/ThemeProvider';

/** Header of the main screens: title, optional subtitle and the real-time indicator. */
export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View className="mb-6 flex-row items-end justify-between">
      <View className="flex-1 pr-3">
        <Text className="text-3xl font-bold tracking-tight text-ink">{title}</Text>
        {subtitle ? <Text className="mt-1 text-sm text-muted">{subtitle}</Text> : null}
      </View>
      <RealtimeIndicator />
    </View>
  );
}

/** "Back" link for nested screens. */
export function BackButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="mb-4 flex-row items-center self-start rounded-lg py-1 pr-2 active:opacity-60">
      <ChevronLeft size={20} color={colors.accent} />
      <Text className="text-sm font-medium text-accent">{label}</Text>
    </Pressable>
  );
}

function RealtimeIndicator() {
  const { t } = useTranslation();
  const status = useRealtimeStatus((s) => s.status);
  const dot = { live: 'bg-accent', connecting: 'bg-warning', offline: 'bg-danger' }[status];
  return (
    <View className="flex-row items-center rounded-full border border-line bg-surface px-2.5 py-1">
      <View className={`mr-1.5 h-2 w-2 rounded-full ${dot}`} />
      <Text className="text-xs text-muted">{t(`realtime.${status}`)}</Text>
    </View>
  );
}
