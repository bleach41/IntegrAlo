/**
 * Settings that change when the project is published. Everything else lives in astro.config.mjs.
 *
 * - repo: the GitHub repository URL (https://github.com/<user>/<repo>). While it is empty, the
 *   "Editar esta página" links and the GitHub icon are hidden and the downloads page uses
 *   src/data/release.json instead of the latest GitHub release.
 * - site / base: the public address of the site. For GitHub Pages of a project repository,
 *   site is https://<user>.github.io and base is /<repo>.
 */
export default {
  repo: 'https://github.com/bleach41/IntegrAlo',
  site: 'https://bleach41.github.io',
  base: '/IntegrAlo',
};
