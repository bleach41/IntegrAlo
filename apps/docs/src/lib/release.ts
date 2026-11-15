import siteConfig from '../../site.config.mjs';
import fallback from '../data/release.json';
import { PLATFORMS, type PlatformId } from '../data/platforms';

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
  /** SHA-256 in hexadecimal, when GitHub provides it. */
  sha256: string | null;
}

export interface Release {
  version: string;
  date: string | null;
  published: boolean;
  /** Link to every release (older versions included), when the repository is public. */
  allReleasesUrl: string | null;
  assets: Record<PlatformId, ReleaseAsset | null>;
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  digest?: string | null;
}

let cached: Promise<Release> | undefined;

/**
 * The latest release, read once per build. With a repository configured it comes from the
 * GitHub API; otherwise (or if GitHub cannot be reached) from src/data/release.json, so the
 * site always builds, also offline.
 */
export function getRelease(): Promise<Release> {
  cached ??= load();
  return cached;
}

async function load(): Promise<Release> {
  const local: Release = { ...(fallback as Omit<Release, 'allReleasesUrl'>), allReleasesUrl: null };
  const repo = siteConfig.repo;
  if (!repo) return local;

  const path = new URL(repo).pathname.replace(/^\/|\/$/g, '');
  try {
    const response = await fetch(`https://api.github.com/repos/${path}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const data = (await response.json()) as { tag_name: string; published_at: string; assets: GitHubAsset[] };

    const assets = Object.fromEntries(
      PLATFORMS.map(({ id, assetPattern }) => {
        const asset = data.assets.find((a) => assetPattern.test(a.name));
        return [
          id,
          asset
            ? {
                name: asset.name,
                url: asset.browser_download_url,
                size: asset.size,
                sha256: asset.digest?.startsWith('sha256:') ? asset.digest.slice(7) : null,
              }
            : null,
        ];
      }),
    ) as Release['assets'];

    return {
      version: data.tag_name.replace(/^v/, ''),
      date: data.published_at,
      published: true,
      allReleasesUrl: `${repo}/releases`,
      assets,
    };
  } catch (error) {
    console.warn(`[docs] Latest release not available, using release.json: ${(error as Error).message}`);
    return { ...local, allReleasesUrl: `${repo}/releases` };
  }
}

export function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString('es', { maximumFractionDigits: 1 })} MB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
}
