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

/**
 * Full-screen container with the app background, safe areas and keyboard handling.
 * `wide` lets content use large screens (dashboards); forms stay narrow and centered.
 * Inside the tab area the bottom edge belongs to the tab bar.
 */
export function Screen({
  children,
  centered = false,
  wide = false,
  inTabs = false,
}: {
  children: ReactNode;
  centered?: boolean;
  wide?: boolean;
  inTabs?: boolean;
}) {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={inTabs ? ['top', 'left', 'right'] : undefined}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerClassName={`grow px-5 py-8 ${centered ? 'justify-center' : ''}`}
          keyboardShouldPersistTaps="handled"
        >
          <View className={`w-full self-center ${wide ? 'max-w-6xl' : 'max-w-xl'}`}>{children}</View>
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

export function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <View className={compact ? '' : 'mb-8 items-center'}>
      <Text className={`font-extrabold tracking-tight text-ink ${compact ? 'text-2xl' : 'text-4xl'}`}>
        Integr<Text className="text-accent">Alo</Text>
      </Text>
      <Text className={`mt-1 text-muted ${compact ? 'text-xs' : 'text-sm'}`}>{t('brand.tagline')}</Text>
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

/** Compact, low-emphasis action for dense panels (e.g. sending a command). */
export function SmallButton({
  label,
  onPress,
  busy = false,
  disabled = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      className={`h-9 flex-row items-center justify-center self-start rounded-full bg-accent/15 px-3.5 active:bg-accent/25 ${busy ? 'opacity-60' : disabled ? 'opacity-40' : ''}`}
    >
      {busy ? <ActivityIndicator size="small" color={colors.accent} /> : icon}
      <Text className="ml-1.5 text-sm font-semibold text-accent">{label}</Text>
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
  busyValue,
  disabled = false,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  /** Option whose change is in progress: shown selected, with a spinner. */
  busyValue?: T;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View className={`flex-row rounded-xl border border-line bg-canvas p-1 ${disabled ? 'opacity-40' : ''}`}>
      {options.map((option) => {
        const selected = option.value === value;
        const busy = option.value === busyValue;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled || busyValue !== undefined}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled, busy }}
            className={`flex-1 flex-row items-center justify-center rounded-lg py-2 ${selected ? 'bg-accent-strong' : disabled ? '' : 'active:bg-line'}`}
          >
            {busy ? <ActivityIndicator size="small" color={selected ? colors['on-accent'] : colors.muted} style={{ marginRight: 6 }} /> : null}
            <Text className={`text-sm font-medium ${selected ? 'text-on-accent' : 'text-muted'}`}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
