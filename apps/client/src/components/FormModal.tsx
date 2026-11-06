import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeScope, useTheme } from '@/theme/ThemeProvider';
import { useIsWide } from './layout';

/**
 * Modal for a form (create or edit something): a sheet from the bottom on phones and a
 * centred dialog on wide screens. Tapping outside or the X closes it; the actions (save,
 * cancel) go in `footer`, always visible below the scrollable body.
 */
export function FormModal({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { colors } = useTheme();
  const wide = useIsWide();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={onClose}>
      {/* The modal is drawn in its own layer: the theme colors must be set again here. */}
      <ThemeScope>
        <KeyboardAvoidingView className={`flex-1 ${wide ? 'items-center justify-center' : 'justify-end'}`} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
          <Pressable accessibilityLabel="close" onPress={onClose} className="absolute inset-0 bg-black/60" />
          <View
            className={`w-full border border-line bg-surface ${wide ? 'max-w-lg rounded-2xl' : 'rounded-t-3xl'}`}
            style={{ maxHeight: '90%', paddingBottom: wide ? 0 : insets.bottom }}
          >
            <View className="flex-row items-center justify-between border-b border-line px-5 py-4">
              <Text className="text-lg font-semibold text-ink">{title}</Text>
              <Pressable onPress={onClose} accessibilityRole="button" className="h-8 w-8 items-center justify-center rounded-full active:bg-line">
                <X size={18} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView contentContainerClassName="px-5 pt-4" keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            <View className="flex-row items-center justify-end border-t border-line px-5 py-3">{footer}</View>
          </View>
        </KeyboardAvoidingView>
      </ThemeScope>
    </Modal>
  );
}
