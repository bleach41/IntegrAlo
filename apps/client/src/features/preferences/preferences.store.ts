import { create } from 'zustand';
import { storage } from '@/lib/storage';

export type ThemePreference = 'system' | 'light' | 'dark';
export type LanguagePreference = 'system' | 'es' | 'en';
/** Style of the module synoptics: ISA-101 flat (default) or illustrated isometric. */
export type VisualStyle = 'flat' | 'iso';

interface PreferencesState {
  theme: ThemePreference;
  language: LanguagePreference;
  visualStyle: VisualStyle;
  loaded: boolean;
  load(): Promise<void>;
  setTheme(theme: ThemePreference): Promise<void>;
  setLanguage(language: LanguagePreference): Promise<void>;
  setVisualStyle(style: VisualStyle): Promise<void>;
}

const THEME_KEY = 'integralo.theme';
const LANGUAGE_KEY = 'integralo.language';
const VISUAL_KEY = 'integralo.visualStyle';
const THEMES: ThemePreference[] = ['system', 'light', 'dark'];
const LANGUAGES: LanguagePreference[] = ['system', 'es', 'en'];
const VISUALS: VisualStyle[] = ['flat', 'iso'];

/** Per-device preferences; "system" follows the phone or browser settings. */
export const usePreferences = create<PreferencesState>((set) => ({
  theme: 'system',
  language: 'system',
  visualStyle: 'flat',
  loaded: false,

  async load() {
    const theme = (await storage.get(THEME_KEY)) as ThemePreference | null;
    const language = (await storage.get(LANGUAGE_KEY)) as LanguagePreference | null;
    const visualStyle = (await storage.get(VISUAL_KEY)) as VisualStyle | null;
    set({
      theme: theme && THEMES.includes(theme) ? theme : 'system',
      language: language && LANGUAGES.includes(language) ? language : 'system',
      visualStyle: visualStyle && VISUALS.includes(visualStyle) ? visualStyle : 'flat',
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

  async setVisualStyle(visualStyle) {
    set({ visualStyle });
    await storage.set(VISUAL_KEY, visualStyle);
  },
}));
