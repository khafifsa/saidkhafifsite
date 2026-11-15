/** Build-wide configuration and URL helpers. */

export interface BuildConfig {
  root: string;
  outDir: string;
  /** Always starts and ends with "/" — e.g. "/" or "/my-repo/" */
  base: string;
  /** Origin without trailing slash, e.g. "https://user.github.io" (may be empty locally) */
  siteUrl: string;
  repo: string;
  branch: string;
  sha: string;
  apiUrl: string;
  dev: boolean;
  /** logical asset name → path relative to the site root */
  assets: Record<string, string>;
  pdfjsDir: string;
}

let current: BuildConfig | undefined;

export function setConfig(cfg: BuildConfig): void {
  current = cfg;
}

export function config(): BuildConfig {
  if (!current) throw new Error('Build config not initialised');
  return current;
}

/** Site-relative URL with the base path, e.g. url('courses/') → "/repo/courses/" */
export function url(path = ''): string {
  if (/^(https?:|mailto:|tel:|#|data:|blob:)/i.test(path)) return path;
  return config().base + path.replace(/^\/+/, '');
}

/** Absolute URL when the public origin is known (for canonical / Open Graph). */
export function absUrl(path = ''): string {
  const cfg = config();
  const rel = url(path);
  return cfg.siteUrl ? cfg.siteUrl + rel : rel;
}

export function asset(name: string): string {
  const p = config().assets[name];
  if (!p) throw new Error(`Unknown asset "${name}"`);
  return url(p);
}
