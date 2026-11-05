import { ReactNode, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, TextInputProps, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

export function Card({ children }: { children: ReactNode }) {
  return <View className="rounded-2xl border border-line bg-surface p-5">{children}</View>;
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
  return (
    <View className="mb-8 items-center">
      <Text className="text-4xl font-extrabold tracking-tight text-ink">
        Integr<Text className="text-accent">Alo</Text>
      </Text>
      <Text className="mt-1 text-sm text-muted">Supervisión y control local</Text>
    </View>
  );
}

interface FieldProps extends Omit<TextInputProps, 'className'> {
  label: string;
  hint?: string;
}

export function Field({ label, hint, ...input }: FieldProps) {
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
        placeholderTextColor="#5b6b85"
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
      {busy ? <ActivityIndicator color={primary ? '#0b1120' : '#e6edf7'} className="mr-2" /> : null}
      <Text className={`text-base font-semibold ${primary ? 'text-canvas' : 'text-accent'}`}>{label}</Text>
    </Pressable>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3">
      <Text className="text-sm leading-5 text-danger">{message}</Text>
    </View>
  );
}
