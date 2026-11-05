import { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, TextInputProps, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Message } from '@/features/auth/errors';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Own interface components. They only use the semantic color tokens (bg-surface,
 * text-ink, …), so they follow the light/dark theme without conditional classes.
 */

/** Full-screen container with the app background, safe areas and keyboard handling. */
export function Screen({ children, centered = false }: { children: ReactNode; centered?: boolean }) {
  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerClassName={`grow px-5 py-8 ${centered ? 'justify-center' : ''}`}
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-md self-center">{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <View className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>{children}</View>;
}

export function Title({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <View className="mb-6">
      <Text className="text-2xl font-bold text-ink">{children}</Text>
      {subtitle ? <Text className="mt-2 text-base leading-6 text-muted">{subtitle}</Text> : null}
    </View>
  );
}

export function Brand() {
  const { t } = useTranslation();
  return (
    <View className="mb-8 items-center">
      <Text className="text-4xl font-extrabold tracking-tight text-ink">
        Integr<Text className="text-accent">Alo</Text>
      </Text>
      <Text className="mt-1 text-sm text-muted">{t('brand.tagline')}</Text>
    </View>
  );
}

interface FieldProps extends Omit<TextInputProps, 'className'> {
  label: string;
  hint?: string;
}

export function Field({ label, hint, ...input }: FieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-sm font-medium text-ink">{label}</Text>
      <TextInput
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        className={`rounded-xl border bg-canvas px-4 py-3 text-base text-ink ${focused ? 'border-accent' : 'border-line'}`}
      />
      {hint ? <Text className="mt-1 text-xs text-muted">{hint}</Text> : null}
    </View>
  );
}

export function Button({
  label,
  onPress,
  busy = false,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  variant?: 'primary' | 'ghost';
}) {
  const { colors } = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      className={`mt-2 flex-row items-center justify-center rounded-xl px-4 py-3.5 ${
        primary ? 'bg-accent-strong active:bg-accent' : 'active:bg-line'
      } ${busy ? 'opacity-60' : ''}`}
    >
      {busy ? <ActivityIndicator color={primary ? colors['on-accent'] : colors.ink} className="mr-2" /> : null}
      <Text className={`text-base font-semibold ${primary ? 'text-on-accent' : 'text-accent'}`}>{label}</Text>
    </Pressable>
  );
}

export function ErrorText({ message }: { message: Message | null }) {
  const { t } = useTranslation();
  if (!message) return null;
  return (
    <View className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3">
      <Text className="text-sm leading-5 text-danger">{t(message.key, message.params)}</Text>
    </View>
  );
}

/** Row of mutually exclusive options (theme, language…). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row rounded-xl border border-line bg-canvas p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={`flex-1 items-center rounded-lg py-2 ${selected ? 'bg-accent-strong' : 'active:bg-line'}`}
          >
            <Text className={`text-sm font-medium ${selected ? 'text-on-accent' : 'text-muted'}`}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
