// Hermes (the JavaScript engine of the app on phones) has no Intl.PluralRules, which
// i18next needs to choose "1 alarma" / "2 alarmas". The polyfill only fills it in when it
// is missing, so browsers keep their own implementation.
import 'intl-pluralrules';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { LanguagePreference } from '@/features/preferences/preferences.store';
import en from './locales/en';
import es from './locales/es';

export const resources = { es: { translation: es }, en: { translation: en } } as const;
export type Language = keyof typeof resources;
const FALLBACK: Language = 'es';

/** Language of the device if the app has it, otherwise Spanish. */
function deviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  return code && code in resources ? (code as Language) : FALLBACK;
}

export function resolveLanguage(preference: LanguagePreference): Language {
  return preference === 'system' ? deviceLanguage() : preference;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: FALLBACK,
  interpolation: { escapeValue: false }, // React already escapes output
  returnNull: false,
});

export default i18n;
