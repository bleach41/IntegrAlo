import { ChevronDown, type LucideIcon } from 'lucide-react-native';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native';
import { storage } from '@/lib/storage';
import { useTheme } from '@/theme/ThemeProvider';

const native = Platform.OS !== 'web';

/**
 * A section that opens and closes from its header, closed by default: for what is used now and
 * then (engineering settings), so the everyday controls stay at hand without scrolling past it.
 * The header keeps a one-line summary (the current values) so a closed section still informs.
 * Whether it was left open is remembered on this device under `id`.
 */
export function Collapsible({
  id,
  title,
  summary,
  icon: Icon,
  large = false,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  icon?: LucideIcon;
  /** Header with the size of a card title (a whole card that folds). */
  large?: boolean;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const key = `integralo.open.${id}`;
  const [open, setOpen] = useState(false);
  const turn = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    void storage.get(key).then((saved) => {
      if (alive && saved === '1') {
        setOpen(true);
        turn.setValue(1);
        fade.setValue(1);
      }
    });
    return () => {
      alive = false;
    };
  }, [key, turn, fade]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    void storage.set(key, next ? '1' : null);
    Animated.timing(turn, { toValue: next ? 1 : 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: native }).start();
    if (next) {
      fade.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: native }).start();
    }
  };

  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const slide = fade.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] });

  return (
    <View>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center py-3 active:opacity-70"
      >
        {Icon ? (
          <View className="mr-3">
            <Icon size={18} color={colors.muted} />
          </View>
        ) : null}
        <View className="flex-1 pr-2">
          <Text className={large ? 'text-lg font-semibold text-ink' : 'text-sm font-medium text-ink'}>{title}</Text>
          {summary ? (
            <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <ChevronDown size={18} color={colors.muted} />
        </Animated.View>
      </Pressable>
      {open ? (
        <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }} className="pb-2">
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}
