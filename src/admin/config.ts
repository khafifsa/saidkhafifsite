/** Values injected into /admin/index.html at build time. */
export interface AdminConfig {
  repo: string;
  branch: string;
  api: string;
  base: string;
  siteUrl: string;
  pdfjs: string;
  name: string;
}

declare global {
  interface Window {
    __ADMIN__?: Partial<AdminConfig>;
  }
}

const raw = window.__ADMIN__ ?? {};

export const CONFIG: AdminConfig = {
  repo: raw.repo ?? '',
  branch: raw.branch || 'main',
  api: raw.api || 'https://api.github.com',
  base: raw.base || '/',
  siteUrl: raw.siteUrl || '',
  pdfjs: raw.pdfjs || '/',
  name: raw.name || '',
};

/** Public URL of a page or file of the site, relative to the admin page. */
export function siteUrl(path = ''): string {
  return CONFIG.base + path.replace(/^\/+/, '');
}
