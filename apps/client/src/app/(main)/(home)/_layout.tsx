import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';

/** The home tab keeps its own stack: dashboard → node detail, with back navigation. */
export default function HomeLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />;
}
