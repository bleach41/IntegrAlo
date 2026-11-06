import type { ModuleIcon as IconName } from '@integralo/contract';
import { Activity, Boxes, Droplet, Fan, Gauge, Lightbulb, LucideIcon, Thermometer, Zap } from 'lucide-react-native';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

/** The manifest names an icon from a closed list; each client draws it with its own set. */
const ICONS: Record<IconName, LucideIcon> = {
  thermometer: Thermometer,
  droplet: Droplet,
  gauge: Gauge,
  zap: Zap,
  fan: Fan,
  lightbulb: Lightbulb,
  activity: Activity,
};

/** Rounded tile with the module icon: tells a room from a tank at a glance. */
export function ModuleIcon({ name, muted = false, size = 40 }: { name?: IconName; muted?: boolean; size?: number }) {
  const { colors } = useTheme();
  const Icon = (name && ICONS[name]) ?? Boxes;
  return (
    <View
      className={`items-center justify-center rounded-xl ${muted ? 'bg-line' : 'bg-accent/15'}`}
      style={{ width: size, height: size }}
    >
      <Icon size={size * 0.5} color={muted ? colors.muted : colors.accent} strokeWidth={2.2} />
    </View>
  );
}
