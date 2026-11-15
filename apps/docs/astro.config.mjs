import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import siteConfig from './site.config.mjs';

const { repo } = siteConfig;

export default defineConfig({
  site: siteConfig.site,
  base: siteConfig.base,
  // The contract is compiled to CommonJS: let Node load it instead of Vite's module runner.
  vite: { ssr: { external: ['@integralo/contract'] } },
  integrations: [
    starlight({
      title: 'IntegrAlo',
      description: 'Plataforma modular local para supervisión y control.',
      logo: { src: './src/assets/logo.svg' },
      favicon: '/favicon.svg',
      // Spanish is the root locale. To add English later: add `en: { label: 'English', lang: 'en' }`
      // here and translate the pages into src/content/docs/en/ (missing ones fall back to Spanish).
      defaultLocale: 'root',
      locales: { root: { label: 'Español', lang: 'es' } },
      customCss: ['./src/styles/custom.css'],
      lastUpdated: true,
      editLink: repo ? { baseUrl: `${repo}/edit/main/apps/docs/` } : undefined,
      social: repo ? [{ icon: 'github', label: 'GitHub', href: repo }] : undefined,
      components: {
        ThemeSelect: './src/components/VersionAndThemeSelect.astro',
      },
      sidebar: [
        // Each group lists the pages of its folder, ordered by `sidebar.order` in each page.
        { label: 'Empezar', items: [{ autogenerate: { directory: 'empezar' } }] },
        { label: 'Guías', items: [{ autogenerate: { directory: 'guias' } }] },
        { label: 'Módulos', items: [{ autogenerate: { directory: 'modulos' } }] },
        { label: 'Firmware', items: [{ autogenerate: { directory: 'firmware' } }] },
        { label: 'Referencia', items: [{ autogenerate: { directory: 'referencia' } }] },
        { label: 'Descargas', link: '/descargas/' },
        { label: 'Cambios', link: '/cambios/' },
      ],
    }),
  ],
});
