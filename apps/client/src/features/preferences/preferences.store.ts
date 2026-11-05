import { create } from 'zustand';
import { storage } from '@/lib/storage';

export type ThemePreference = 'system' | 'light' | 'dark';
export type LanguagePreference = 'system' | 'es' | 'en';

interface PreferencesState {
  theme: ThemePreference;
  language: LanguagePreference;
  loaded: boolean;
  load(): Promise<void>;
  setTheme(theme: ThemePreference): Promise<void>;
  setLanguage(language: LanguagePreference): Promise<void>;
}

const THEME_KEY = 'integralo.theme';
const LANGUAGE_KEY = 'integralo.language';
const THEMES: ThemePreference[] = ['system', 'light', 'dark'];
const LANGUAGES: LanguagePreference[] = ['system', 'es', 'en'];

/** Per-device preferences; "system" follows the phone or browser settings. */
export const usePreferences = create<PreferencesState>((set) => ({
  theme: 'system',
  language: 'system',
  loaded: false,

  async load() {
    const theme = (await storage.get(THEME_KEY)) as ThemePreference | null;
    const language = (await storage.get(LANGUAGE_KEY)) as LanguagePreference | null;
    set({
      theme: theme && THEMES.includes(theme) ? theme : 'system',
      language: language && LANGUAGES.includes(language) ? language : 'system',
      loaded: true,
    });
  },

  async setTheme(theme) {
    set({ theme });
    await storage.set(THEME_KEY, theme);
  },

  async setLanguage(language) {
    set({ language });
    await storage.set(LANGUAGE_KEY, language);
  },
}));
