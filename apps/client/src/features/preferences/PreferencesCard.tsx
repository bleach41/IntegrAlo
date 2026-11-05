import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Card, Segmented } from '@/components/ui';
import { LanguagePreference, ThemePreference, usePreferences } from './preferences.store';

/** Theme and language selectors; changes apply immediately and are remembered. */
export function PreferencesCard() {
  const { t } = useTranslation();
  const { theme, language, setTheme, setLanguage } = usePreferences();

  return (
    <Card className="mt-4">
      <Text className="mb-4 text-lg font-semibold text-ink">{t('preferences.title')}</Text>
      <Text className="mb-2 text-sm font-medium text-muted">{t('preferences.theme')}</Text>
      <Segmented<ThemePreference>
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'system', label: t('preferences.system') },
          { value: 'light', label: t('preferences.light') },
          { value: 'dark', label: t('preferences.dark') },
        ]}
      />
      <View className="h-4" />
      <Text className="mb-2 text-sm font-medium text-muted">{t('preferences.language')}</Text>
      <Segmented<LanguagePreference>
        value={language}
        onChange={setLanguage}
        options={[
          { value: 'system', label: t('preferences.system') },
          { value: 'es', label: t('preferences.es') },
          { value: 'en', label: t('preferences.en') },
        ]}
      />
    </Card>
  );
}
