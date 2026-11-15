/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { COLLECTIONS, COLLECTION_ORDER, displayName, type AnyItem, type CollectionName, type SiteSettings } from '../lib/schema';
import { CONFIG, siteUrl } from './config';
import { loadAll, type AdminData } from './data';
import { useDeploy, type DeployState } from './deploy';
import { GitHub, describeError } from './github';
import { Confirm, Emblem, Icon, Spinner, ToastProvider } from './ui';
import { DeleteDialog, EditView, HelpView, HomeView, ListView, LoginView } from './views';

type Route =
  | { name: 'home' }
  | { name: 'list'; col: CollectionName }
  | { name: 'edit'; col: CollectionName; id?: string; preset: Record<string, string> }
  | { name: 'settings' }
  | { name: 'help' };

function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const preset = Object.fromEntries(new URLSearchParams(query));
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'help') return { name: 'help' };
  const col = parts[0] as CollectionName;
  if (col && col in COLLECTIONS) {
    if (parts[1] === 'new') return { name: 'edit', col, preset };
    if (parts[1]) return { name: 'edit', col, id: parts[1], preset };
    return { name: 'list', col };
  }
  return { name: 'home' };
}

const TOKEN_KEY = 'admin.token';
const REPO_KEY = 'admin.repo';

function storedAuth(): { token: string; repo: string } | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    const repo = CONFIG.repo || localStorage.getItem(REPO_KEY) || '';
    return token && repo ? { token, repo } : null;
  } catch {
    return null;
  }
}

function forget() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function App() {
  return (
    <ToastProvider>
      <Admin />
    </ToastProvider>
  );
}

function Admin() {
  const [gh, setGh] = useState<GitHub | null>(null);
  const [data, setData] = useState<AdminData | null>(null);
  const [phase, setPhase] = useState<'checking' | 'login' | 'ready'>(() => (storedAuth() ? 'checking' : 'login'));
  const [loginError, setLoginError] = useState<string>();
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  const [dirty, setDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ col: CollectionName; item: AnyItem } | 'samples' | null>(null);
  const [storage, setStorage] = useState<number | null>(null);
  const deploy = useDeploy(gh);

  const connect = useCallback(async (token: string, repo: string, remember: boolean) => {
    setLoginError(undefined);
    setPhase('checking');
    try {
      const probe = new GitHub(token, repo, CONFIG.branch, CONFIG.api);
      const info = await probe.repoInfo();
      if (info.permissions && info.permissions.push === false) {
        throw new Error('مفتاح الدخول صالح، لكنه لا يملك صلاحية الكتابة («Contents: Read and write») على مستودع الموقع.');
      }
      const client = new GitHub(token, repo, CONFIG.branch || info.default_branch, CONFIG.api);
      const loaded = await loadAll(client);
      try {
        (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
        if (!CONFIG.repo) localStorage.setItem(REPO_KEY, repo);
      } catch {
        /* private mode */
      }
      setGh(client);
      setData(loaded);
      setPhase('ready');
      client.treeSize('public/').then(setStorage).catch(() => setStorage(null));
    } catch (e) {
      const message = e instanceof Error && !('status' in e) ? e.message : describeError(e);
      if ((e as { status?: number }).status === 401) forget();
      setLoginError(message);
      setPhase('login');
    }
  }, []);

  useEffect(() => {
    const auth = storedAuth();
    if (auth) void connect(auth.token, auth.repo, true);
  }, [connect]);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route]);

  const navigate = useCallback(
    (hash: string) => {
      if (dirty && (route.name === 'edit' || route.name === 'settings')) {
        setPendingNav(hash);
        return;
      }
      if (location.hash === hash) setRoute(parseRoute(hash));
      else location.hash = hash;
    },
    [dirty, route.name],
  );

  const logout = () => {
    forget();
    setGh(null);
    setData(null);
    setPhase('login');
    location.hash = '';
  };

  const onSaved = (col: CollectionName | 'settings', item: Record<string, unknown>, sha: string) => {
    setData((d) => {
      if (!d) return d;
      if (col === 'settings') return { ...d, site: item as unknown as SiteSettings };
      const list = d.items[col].filter((x) => x.id !== item.id);
      const next = [item as unknown as AnyItem, ...list].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
      return { ...d, items: { ...d.items, [col]: next } };
    });
    deploy.track(sha);
    gh?.treeSize('public/').then(setStorage).catch(() => {});
  };

  const onDeleted = (removed: { col: CollectionName; id: string }[], sha: string) => {
    setData((d) => {
      if (!d) return d;
      const items = { ...d.items };
      for (const { col, id } of removed) items[col] = items[col].filter((x) => x.id !== id);
      return { ...d, items };
    });
    setDeleting(null);
    setDirty(false);
    deploy.track(sha);
    if (route.name === 'edit') location.hash = `#/${route.col}`;
  };

  if (phase !== 'ready' || !gh || !data) {
    if (phase === 'checking')
      return (
        <div className="boot">
          <div className="boot-spinner" aria-hidden="true"></div>
          <p>جارٍ تحميل المحتوى…</p>
        </div>
      );
    return <LoginView onLogin={connect} error={loginError} busy={false} />;
  }

  const siteName = data.site.name && !data.site.placeholder ? displayName(data.site) : CONFIG.name || displayName(data.site);
  let view: JSX.Element;
  switch (route.name) {
    case 'list':
      view = <ListView col={route.col} data={data} navigate={navigate} onDelete={(col, item) => setDeleting({ col, item })} />;
      break;
    case 'edit':
      view = (
        <EditView
          key={`${route.col}:${route.id ?? 'new'}`}
          col={route.col}
          id={route.id}
          preset={route.preset}
          data={data}
          gh={gh}
          navigate={navigate}
          onSaved={onSaved}
          onDelete={(col, item) => setDeleting({ col, item })}
          setDirty={setDirty}
        />
      );
      break;
    case 'settings':
      view = (
        <EditView key="settings" col="settings" preset={{}} data={data} gh={gh} navigate={navigate} onSaved={onSaved} onDelete={() => {}} setDirty={setDirty} />
      );
      break;
    case 'help':
      view = <HelpView />;
      break;
    default:
      view = <HomeView data={data} navigate={navigate} onDeleteSamples={() => setDeleting('samples')} storage={storage} />;
  }

  const activeKey = route.name === 'list' || route.name === 'edit' ? route.col : route.name;
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/" onClick={(e) => (e.preventDefault(), navigate('#/'))}>
          <Emblem size={38} />
          <span>
            <strong>لوحة التحكم</strong>
            <small>{siteName}</small>
          </span>
        </a>
        <div className="top-actions">
          <DeployPill state={deploy.state} actionsUrl={deploy.actionsUrl} onDismiss={deploy.dismiss} />
          <a className="top-btn" href={siteUrl('')} target="_blank" rel="noopener">
            <Icon name="external" />
            <span>عرض الموقع</span>
          </a>
          <ThemeButton />
          <button type="button" className="top-btn" onClick={logout} title="تسجيل الخروج">
            <Icon name="logout" />
            <span>خروج</span>
          </button>
        </div>
      </header>
      <div className="layout">
        <nav className="sidenav" aria-label="أقسام لوحة التحكم">
          <SideLink href="#/" icon="home" label="الرئيسية" active={activeKey === 'home'} navigate={navigate} />
          <p className="side-label">المحتوى</p>
          {COLLECTION_ORDER.map((col) => (
            <SideLink
              key={col}
              href={`#/${col}`}
              icon={COLLECTIONS[col].icon}
              label={COLLECTIONS[col].label}
              count={data.items[col].length}
              active={activeKey === col}
              navigate={navigate}
            />
          ))}
          <p className="side-label">الموقع</p>
          <SideLink href="#/settings" icon="settings" label="الإعدادات" active={activeKey === 'settings'} navigate={navigate} />
          <SideLink href="#/help" icon="help" label="دليل الاستعمال" active={activeKey === 'help'} navigate={navigate} />
        </nav>
        <main className="main">{view}</main>
      </div>
      {deleting ? <DeleteDialog target={deleting} data={data} gh={gh} onClose={() => setDeleting(null)} onDeleted={onDeleted} /> : null}
      {pendingNav ? (
        <Confirm
          title="تغييرات غير محفوظة"
          text="لم تحفظ التغييرات التي أجريتها. هل تريد المغادرة دون حفظ؟"
          confirmLabel="المغادرة دون حفظ"
          danger
          onClose={() => setPendingNav(null)}
          onConfirm={() => {
            const target = pendingNav;
            setPendingNav(null);
            setDirty(false);
            location.hash = target;
          }}
        />
      ) : null}
    </div>
  );
}

function SideLink({
  href,
  icon,
  label,
  count,
  active,
  navigate,
}: {
  href: string;
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  count?: number;
  active: boolean;
  navigate: (h: string) => void;
}) {
  return (
    <a
      className={`side-link ${active ? 'active' : ''}`}
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        navigate(href);
      }}
    >
      <Icon name={icon} />
      <span className="grow">{label}</span>
      {count != null ? <span className="side-count">{count}</span> : null}
    </a>
  );
}

function DeployPill({ state, actionsUrl, onDismiss }: { state: DeployState; actionsUrl: string; onDismiss: () => void }) {
  const content = useMemo(() => {
    switch (state.status) {
      case 'pending':
        return (
          <span className="pill pill-pending" title="يظهر التحديث على الموقع عادةً خلال دقيقة إلى دقيقتين">
            <Spinner />
            <span>جارٍ النشر…</span>
          </span>
        );
      case 'live':
        return (
          <button type="button" className="pill pill-live" onClick={onDismiss} title="إخفاء">
            <Icon name="check" />
            <span>تم النشر على الموقع</span>
          </button>
        );
      case 'failed':
        return (
          <a className="pill pill-failed" href={state.url || actionsUrl} target="_blank" rel="noopener">
            <Icon name="alert" />
            <span>تعذّر النشر — التفاصيل</span>
          </a>
        );
      case 'slow':
        return (
          <a className="pill pill-slow" href={actionsUrl} target="_blank" rel="noopener">
            <Icon name="clock" />
            <span>النشر يستغرق وقتاً أطول</span>
          </a>
        );
      default:
        return null;
    }
  }, [state, actionsUrl, onDismiss]);
  return <div aria-live="polite">{content}</div>;
}

function ThemeButton() {
  const toggle = () => {
    const root = document.documentElement;
    const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* ignore */
    }
  };
  return (
    <button type="button" className="top-btn icon-only" onClick={toggle} title="الوضع الليلي" aria-label="تبديل الوضع الليلي">
      <Icon name="moon" />
    </button>
  );
}
