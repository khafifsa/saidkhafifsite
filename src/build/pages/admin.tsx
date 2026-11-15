import { Html, raw, render } from '../../lib/jsx/jsx-runtime';
import { displayName } from '../../lib/schema';
import { asset, config, url } from '../ctx';
import type { Store } from '../content';

const FONTS =
  'https://fonts.googleapis.com/css2?family=Amiri:wght@700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@400;600&display=swap';

/** Shell page for the admin panel (the React app mounts into #admin-root). */
export function AdminPage(store: Store): Html {
  const cfg = config();
  const boot = {
    repo: cfg.repo,
    branch: cfg.branch || 'main',
    api: cfg.apiUrl,
    base: cfg.base,
    siteUrl: cfg.siteUrl ? cfg.siteUrl + cfg.base : '',
    pdfjs: url(cfg.pdfjsDir),
    name: displayName(store.site),
  };
  const json = JSON.stringify(boot).replace(/</g, '\\u003c');
  const doc = (
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>لوحة التحكم — {displayName(store.site)}</title>
        <link rel="icon" href={url('favicon.svg')} type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link rel="stylesheet" href={FONTS} />
        <link rel="stylesheet" href={asset('admin.css')} />
        <script>{raw(`window.__ADMIN__=${json};`)}</script>
        <script>
          {raw(
            "(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}})();",
          )}
        </script>
        <script type="module" src={asset('admin.js')}></script>
      </head>
      <body>
        <div id="admin-root">
          <div class="boot">
            <div class="boot-spinner" aria-hidden="true"></div>
            <p>جارٍ تحميل لوحة التحكم…</p>
          </div>
        </div>
        <noscript>
          <p style="padding:2rem;text-align:center">تتطلب لوحة التحكم تفعيل JavaScript في المتصفح.</p>
        </noscript>
      </body>
    </html>
  );
  return new Html('<!doctype html>\n' + render(doc));
}
