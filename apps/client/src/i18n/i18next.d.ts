import 'i18next';
import type es from './locales/es';

// Typed keys: t('login.title') is checked at compile time; a typo does not compile.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof es };
  }
}
