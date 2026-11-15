import { Html, raw, render, type Child } from '../../lib/jsx/jsx-runtime';
import { displayName, forName } from '../../lib/schema';
import { iconSvg, type IconName } from '../../lib/icons';
import { absUrl, asset, config, url } from '../ctx';
import { getStore } from '../state';
import { ArchDefs, Emblem, Icon } from './ui';

export type NavKey = 'home' | 'courses' | 'lectures' | 'articles' | 'books' | 'publications' | 'announcements' | 'about';

const FONTS =
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@400;600;700&display=swap';

const THEME_INIT =
  "(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}})();";

export interface LayoutProps {
  title: string;
  description?: string;
  path: string;
  nav?: NavKey;
  children: Child;
  ogType?: string;
  ogImage?: string;
  noindex?: boolean;
  reader?: boolean;
  bodyClass?: string;
  progress?: boolean;
}

function navItems(): { key: NavKey; href: string; label: string }[] {
  const s = getStore();
  const items: { key: NavKey; href: string; label: string; show: boolean }[] = [
    { key: 'home', href: '', label: 'الرئيسية', show: true },
    { key: 'courses', href: 'courses/', label: 'المقررات', show: true },
    { key: 'lectures', href: 'lectures/', label: 'المحاضرات', show: true },
    { key: 'articles', href: 'articles/', label: 'المقالات', show: s.articles.length > 0 },
    { key: 'books', href: 'books/', label: 'المؤلفات', show: s.books.length > 0 },
    { key: 'publications', href: 'publications/', label: 'الأبحاث', show: s.publications.length > 0 },
    { key: 'announcements', href: 'announcements/', label: 'الإعلانات', show: s.announcements.length > 0 },
    { key: 'about', href: 'about/', label: 'السيرة العلمية', show: true },
  ];
  return items.filter((i) => i.show);
}

export function Layout(props: LayoutProps): Html {
  const store = getStore();
  const site = store.site;
  const cfg = config();
  const name = displayName(site);
  const pageTitle = props.path === '' ? `${name} — ${site.title || 'الموقع العلمي'}` : `${props.title} — ${name}`;
  const description = props.description || site.tagline || `الموقع العلمي ${forName(name)}: محاضرات ومقررات ومقالات وأبحاث.`;
  const ogImage = props.ogImage ? absUrl(props.ogImage) : absUrl('og.png');
  const institutions = site.institutions;
  const university = institutions.find((i) => i.university)?.university;
  const sub = [site.title, site.specialty].filter(Boolean).join(' — ');

  const doc = (
    <html lang="ar" dir="rtl" data-base={cfg.base}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{pageTitle}</title>
        <meta name="description" content={description} />
        {props.noindex ? <meta name="robots" content="noindex" /> : null}
        {cfg.siteUrl ? <link rel="canonical" href={absUrl(props.path)} /> : null}
        <meta property="og:type" content={props.ogType ?? 'website'} />
        <meta property="og:locale" content="ar_MA" />
        <meta property="og:site_name" content={name} />
        <meta property="og:title" content={props.path === '' ? name : props.title} />
        <meta property="og:description" content={description} />
        {cfg.siteUrl ? <meta property="og:url" content={absUrl(props.path)} /> : null}
        <meta property="og:image" content={ogImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="theme-color" content="#0e4a38" />
        <link rel="icon" href={url('favicon.svg')} type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link rel="stylesheet" href={FONTS} />
        <link rel="stylesheet" href={asset('site.css')} />
        {props.reader ? <link rel="stylesheet" href={asset('reader.css')} /> : null}
        <script>{raw(THEME_INIT)}</script>
        <script type="module" src={asset('site.js')}></script>
        {props.reader ? <script type="module" src={asset('reader.js')}></script> : null}
      </head>
      <body class={props.bodyClass} data-search-index={url('search-index.json')} data-assets={url(cfg.pdfjsDir)}>
        <a class="skip-link" href="#main">
          تخطَّ إلى المحتوى
        </a>
        {props.progress ? <div class="reading-progress" aria-hidden="true"></div> : null}
        <ArchDefs />
        <div class="topbar">
          <div class="container">
            <div class="topbar-aff">
              {university ? <span class="uni">{university}</span> : null}
              {institutions.map((inst, i) => (
                <>
                  {i > 0 || university ? <i class="diamond" aria-hidden="true"></i> : null}
                  <span>{inst.short || inst.name}</span>
                </>
              ))}
            </div>
            <div class="topbar-tools">
              {site.email ? (
                <a class="topbar-mail" href={`mailto:${site.email}`}>
                  <Icon name="mail" />
                  <span class="ltr">{site.email}</span>
                </a>
              ) : null}
              <button type="button" class="icon-btn theme-toggle" data-theme-toggle aria-label="تبديل الوضع الليلي">
                <Icon name="moon" class="icon sun" />
                <Icon name="sun" class="icon moon" />
              </button>
            </div>
          </div>
        </div>
        <header class="masthead pattern">
          <div class="container">
            <a class="brand" href={url('')} aria-label={`${name} — الصفحة الرئيسية`}>
              <Emblem id="brand" />
              <span class="brand-text">
                <span class="brand-name">{name}</span>
                {sub ? <span class="brand-sub">{sub}</span> : null}
                {institutions.length ? (
                  <span class="brand-aff">{institutions.map((i) => i.name).join(' · ')}</span>
                ) : null}
              </span>
            </a>
            <button type="button" class="search-trigger" data-search-open aria-haspopup="dialog">
              <Icon name="search" />
              <span>ابحث في المحاضرات والمقالات…</span>
              <kbd>/</kbd>
            </button>
          </div>
        </header>
        <nav class="mainnav" aria-label="القائمة الرئيسية" data-nav>
          <div class="container">
            <button type="button" class="nav-toggle" data-nav-toggle aria-expanded="false" aria-controls="nav-list">
              <Icon name="menu" />
              القائمة
            </button>
            <ul id="nav-list">
              {navItems().map((item) => (
                <li>
                  <a href={url(item.href)} aria-current={props.nav === item.key ? 'page' : undefined}>
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <button type="button" class="nav-search" data-search-open aria-label="البحث">
              <Icon name="search" />
              بحث
            </button>
          </div>
        </nav>
        <div class="band" aria-hidden="true"></div>
        <main id="main">{props.children}</main>
        <Footer />
        <dialog class="search" id="search-dialog" aria-label="البحث في الموقع">
          <form method="dialog" class="search-box" role="search" data-search-form>
            <Icon name="search" />
            <input
              type="search"
              id="search-input"
              placeholder="ابحث عن محاضرة، مقرر، مقال…"
              autocomplete="off"
              aria-label="عبارة البحث"
              aria-controls="search-results"
              enterkeyhint="search"
            />
            <button class="icon-btn" value="close" aria-label="إغلاق البحث" formnovalidate>
              <Icon name="x" />
            </button>
          </form>
          <div id="search-results" class="search-results" role="listbox" aria-label="نتائج البحث">
            <p class="search-hint">اكتب كلمة أو أكثر للبحث في المحاضرات والمقررات والمقالات والأبحاث.</p>
          </div>
        </dialog>
        <template id="type-icons">
          {raw(
            (
              [
                ['lecture', 'lecture'],
                ['course', 'course'],
                ['article', 'article'],
                ['book', 'book'],
                ['publication', 'publication'],
                ['announcement', 'announcement'],
              ] as [string, IconName][]
            )
              .map(([type, icon]) => iconSvg(icon).replace('<svg ', `<svg data-icon="${type}" `))
              .join(''),
          )}
        </template>
      </body>
    </html>
  );
  return new Html('<!doctype html>\n' + render(doc));
}

function Footer(): Html {
  const store = getStore();
  const site = store.site;
  const name = displayName(site);
  const year = new Date().getFullYear();
  return (
    <footer class="site-footer pattern">
      <div class="container footer-grid">
        <div>
          <div class="footer-brand">
            <Emblem id="foot" />
            <div>
              <strong>{name}</strong>
              <span>{[site.title, site.specialty].filter(Boolean).join(' — ')}</span>
            </div>
          </div>
          {site.tagline ? <p>{site.tagline}</p> : null}
        </div>
        <div>
          <h3>روابط سريعة</h3>
          <ul class="footer-links">
            {navItems()
              .filter((i) => i.key !== 'home')
              .map((i) => (
                <li>
                  <a href={url(i.href)}>
                    <Icon name="chevronLeft" />
                    {i.label}
                  </a>
                </li>
              ))}
          </ul>
        </div>
        <div>
          <h3>التواصل</h3>
          <div class="contact-lines">
            {site.email ? (
              <p>
                <Icon name="mail" />
                <a class="ltr" href={`mailto:${site.email}`}>
                  {site.email}
                </a>
              </p>
            ) : null}
            {site.phone ? (
              <p>
                <Icon name="phone" />
                <span class="ltr">{site.phone}</span>
              </p>
            ) : null}
            {site.office ? (
              <p>
                <Icon name="pin" />
                <span>{site.office}</span>
              </p>
            ) : null}
            {site.officeHours ? (
              <p>
                <Icon name="clock" />
                <span>{site.officeHours}</span>
              </p>
            ) : null}
            {site.institutions.map((i) => (
              <p>
                <Icon name="landmark" />
                <span>{[i.name, i.university].filter(Boolean).join(' — ')}</span>
              </p>
            ))}
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <div class="container">
          <span>
            © {year} {name}. {site.footerNote || 'جميع المحتويات متاحة للطلبة والباحثين لأغراض التعلم والبحث العلمي.'}
          </span>
          <a href={url('admin/')} rel="nofollow">
            لوحة التحكم
          </a>
        </div>
      </div>
    </footer>
  );
}
