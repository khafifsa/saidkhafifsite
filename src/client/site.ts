/** Public site behaviour: menu, theme, search, filters, sharing. Progressive enhancement only. */
import { normalize } from '../lib/arabic';

interface SearchDoc {
  t: string;
  l: string;
  ti: string;
  u: string;
  d: string;
  m: string;
  n: string;
}

const root = document.documentElement;
const base = root.dataset.base || '/';
const $ = <T extends Element = HTMLElement>(sel: string, scope: ParentNode = document) => scope.querySelector<T & Element>(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string, scope: ParentNode = document) => Array.from(scope.querySelectorAll(sel)) as T[];

/* ------------------------------------------------------------- toast */
export function toast(message: string): void {
  $('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 2400);
}

/* ------------------------------------------------------------- theme */
for (const btn of $$('[data-theme-toggle]')) {
  btn.addEventListener('click', () => {
    const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* private mode */
    }
  });
}

/* ------------------------------------------------------------- mobile menu */
const nav = $('[data-nav]');
const navToggle = $('[data-nav-toggle]');
navToggle?.addEventListener('click', () => {
  const open = !nav!.hasAttribute('data-open');
  nav!.toggleAttribute('data-open', open);
  navToggle.setAttribute('aria-expanded', String(open));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && nav?.hasAttribute('data-open')) {
    nav.removeAttribute('data-open');
    navToggle?.setAttribute('aria-expanded', 'false');
    navToggle?.focus();
  }
});

/* ------------------------------------------------------------- sharing */
const pageUrl = () => location.href.split('#')[0]!;

for (const a of $$<HTMLAnchorElement>('a[data-wa]')) {
  a.href = `https://wa.me/?text=${encodeURIComponent(`${a.dataset.title ?? document.title}\n${pageUrl()}`)}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

document.addEventListener('click', async (e) => {
  const target = e.target as Element;
  const share = target.closest<HTMLElement>('[data-share]');
  if (share) {
    const link = pageUrl();
    const title = share.dataset.title ?? document.title;
    if (navigator.share) {
      try {
        await navigator.share({ title, url: link });
      } catch {
        /* cancelled */
      }
    } else if (await copyText(link)) {
      toast('تم نسخ الرابط، يمكنك لصقه في أي تطبيق');
    }
    return;
  }
  const copy = target.closest<HTMLElement>('[data-copy]');
  if (copy) {
    if (await copyText(pageUrl())) toast('تم نسخ الرابط');
  }
});

/* ------------------------------------------------------------- home feed filters */
const feed = $('[data-feed]');
if (feed) {
  const items = $$<HTMLElement>('.feed-item', feed);
  const pageSize = Number(feed.dataset.pageSize || 8);
  const more = $('[data-feed-more]');
  const chips = $$<HTMLButtonElement>('[data-filter]');
  let filter = 'all';
  let limit = pageSize;
  const apply = () => {
    let shown = 0;
    let matched = 0;
    for (const li of items) {
      const ok = filter === 'all' || li.dataset.type === filter;
      if (ok) matched++;
      const visible = ok && shown < limit;
      if (visible) shown++;
      li.hidden = !visible;
    }
    if (more) more.hidden = matched <= limit;
  };
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      filter = chip.dataset.filter ?? 'all';
      limit = pageSize;
      for (const c of chips) c.setAttribute('aria-pressed', String(c === chip));
      apply();
    });
  }
  more?.addEventListener('click', () => {
    limit += pageSize;
    apply();
  });
}

/* ------------------------------------------------------------- lecture list filters */
const docList = $('[data-doc-list]');
if (docList) {
  const rows = $$<HTMLElement>('.doc-row', docList).map((row) => ({ row, text: normalize(row.dataset.text ?? '') }));
  const text = $<HTMLInputElement>('[data-filter-text]');
  const course = $<HTMLSelectElement>('[data-filter-course]');
  const empty = $('[data-doc-empty]');
  const kindChips = $$<HTMLButtonElement>('[data-filter-kind]');
  let kind = '';
  const params = new URLSearchParams(location.search);
  if (course && params.get('course')) course.value = params.get('course')!;
  const apply = () => {
    const tokens = normalize(text?.value ?? '').split(' ').filter(Boolean);
    let visible = 0;
    for (const { row, text: t } of rows) {
      const ok =
        (!course?.value || row.dataset.course === course.value) &&
        (!kind || row.dataset.kind === kind) &&
        tokens.every((tok) => t.includes(tok));
      row.hidden = !ok;
      if (ok) visible++;
    }
    if (empty) empty.hidden = visible > 0;
  };
  text?.addEventListener('input', apply);
  course?.addEventListener('change', apply);
  for (const chip of kindChips) {
    chip.addEventListener('click', () => {
      kind = chip.dataset.filterKind ?? '';
      for (const c of kindChips) c.setAttribute('aria-pressed', String(c === chip));
      apply();
    });
  }
  apply();
}

/* ------------------------------------------------------------- publications filter */
const pubChips = $$<HTMLButtonElement>('[data-pub-kind]');
if (pubChips.length) {
  for (const chip of pubChips) {
    chip.addEventListener('click', () => {
      const kind = chip.dataset.pubKind ?? '';
      for (const c of pubChips) c.setAttribute('aria-pressed', String(c === chip));
      for (const section of $$('[data-pub-year]')) {
        let visible = 0;
        for (const item of $$<HTMLElement>('.pub-item', section)) {
          const ok = !kind || item.dataset.kind === kind;
          item.hidden = !ok;
          if (ok) visible++;
        }
        section.hidden = visible === 0;
      }
    });
  }
}

/* ------------------------------------------------------------- Word / PowerPoint reader tabs */
for (const reader of $$('.office-reader')) {
  const tabs = $$<HTMLButtonElement>('[data-tab]', reader);
  if (!tabs.length) continue;
  const activate = (name: string) => {
    for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.tab === name));
    for (const panel of $$('[data-panel]', reader)) panel.hidden = panel.dataset.panel !== name;
    if (name === 'original') {
      const frame = $<HTMLIFrameElement>('iframe[data-src]', reader);
      if (frame && !frame.getAttribute('src')) frame.src = frame.dataset.src!;
    }
  };
  const KEY = 'reader.view';
  for (const t of tabs)
    t.addEventListener('click', () => {
      const name = t.dataset.tab ?? 'text';
      activate(name);
      try {
        localStorage.setItem(KEY, name);
      } catch {
        /* private mode */
      }
    });
  let saved = 'text';
  try {
    saved = localStorage.getItem(KEY) === 'original' ? 'original' : 'text';
  } catch {
    /* private mode */
  }
  activate(location.hash.indexOf('#slide-') === 0 ? 'text' : saved);
}

/* ------------------------------------------------------------- search */
const TONES: Record<string, string> = {
  lecture: 'emerald',
  course: 'emerald',
  article: 'brass',
  book: 'wine',
  publication: 'indigo',
  announcement: 'red',
};
const dateFmt = new Intl.DateTimeFormat('ar-MA-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

let index: SearchDoc[] | null = null;
let indexPromise: Promise<SearchDoc[]> | null = null;
function loadIndex(): Promise<SearchDoc[]> {
  if (index) return Promise.resolve(index);
  indexPromise ??= fetch(document.body.dataset.searchIndex ?? `${base}search-index.json`)
    .then((r) => r.json() as Promise<SearchDoc[]>)
    .then((d) => (index = d))
    .catch(() => (index = []));
  return indexPromise;
}

function search(query: string, docs: SearchDoc[]): SearchDoc[] {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (!tokens.length) return [];
  const scored: { doc: SearchDoc; score: number }[] = [];
  for (const doc of docs) {
    if (!tokens.every((t) => doc.n.includes(t))) continue;
    const title = normalize(doc.ti);
    let score = 0;
    for (const t of tokens) score += title.includes(t) ? (title.startsWith(t) ? 6 : 4) : 1;
    scored.push({ doc, score });
  }
  return scored.sort((a, b) => b.score - a.score || b.doc.d.localeCompare(a.doc.d)).slice(0, 40).map((s) => s.doc);
}

function highlight(text: string, query: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const words = query.trim().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) {
    frag.append(text);
    return frag;
  }
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  for (const part of text.split(re)) {
    if (!part) continue;
    if (re.test(part)) {
      const m = document.createElement('mark');
      m.textContent = part;
      frag.append(m);
    } else frag.append(part);
    re.lastIndex = 0;
  }
  return frag;
}

function renderResults(container: HTMLElement, docs: SearchDoc[], query: string): HTMLAnchorElement[] {
  container.replaceChildren();
  if (!query.trim()) {
    const p = document.createElement('p');
    p.className = 'search-hint';
    p.textContent = 'اكتب كلمة أو أكثر للبحث في المحاضرات والمقررات والمقالات والأبحاث.';
    container.append(p);
    return [];
  }
  if (!docs.length) {
    const p = document.createElement('p');
    p.className = 'search-hint';
    p.textContent = `لا توجد نتائج لعبارة «${query.trim()}». جرّب كلمة أخرى.`;
    container.append(p);
    return [];
  }
  const links: HTMLAnchorElement[] = [];
  const iconTpl = document.getElementById('type-icons') as HTMLTemplateElement | null;
  for (const d of docs) {
    const a = document.createElement('a');
    a.className = 'search-result';
    a.href = base + d.u;
    a.setAttribute('role', 'option');
    a.dataset.tone = TONES[d.t] ?? 'emerald';
    const vis = document.createElement('span');
    vis.className = 'feed-visual';
    const icon = iconTpl?.content.querySelector(`[data-icon="${d.t}"]`);
    if (icon) vis.append(icon.cloneNode(true));
    const body = document.createElement('span');
    const strong = document.createElement('strong');
    strong.append(highlight(d.ti, query));
    const small = document.createElement('small');
    const date = d.d ? dateFmt.format(new Date(d.d + 'T00:00:00Z')) : '';
    small.textContent = [d.l, d.m, d.t === 'course' ? '' : date].filter(Boolean).join(' · ');
    body.append(strong, small);
    a.append(vis, body);
    container.append(a);
    links.push(a);
  }
  return links;
}

const dialog = $<HTMLDialogElement>('#search-dialog');
const input = $<HTMLInputElement>('#search-input');
const results = $('#search-results');
let links: HTMLAnchorElement[] = [];
let selected = -1;

function select(i: number) {
  links.forEach((l, k) => l.setAttribute('aria-selected', String(k === i)));
  selected = i;
  links[i]?.scrollIntoView({ block: 'nearest' });
}

function openSearch() {
  if (!dialog || !input) return;
  if (!dialog.open) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  input.focus();
  input.select();
  void loadIndex();
  nav?.removeAttribute('data-open');
}

for (const b of $$('[data-search-open]')) b.addEventListener('click', openSearch);

document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
    e.preventDefault();
    openSearch();
  }
});

if (dialog && input && results) {
  let timer = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const docs = await loadIndex();
      links = renderResults(results, search(input.value, docs), input.value);
      select(links.length ? 0 : -1);
    }, 90);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      select(Math.min(selected + 1, links.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      select(Math.max(selected - 1, 0));
    }
  });
  $('[data-search-form]')?.addEventListener('submit', (e) => {
    const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.value === 'close') return;
    e.preventDefault();
    const target = links[selected] ?? links[0];
    if (target) location.href = target.href;
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

/* standalone search page (/search/?q=…) */
const pageInput = $<HTMLInputElement>('[data-search-page]');
const pageResults = $('[data-search-page-results]');
if (pageInput && pageResults) {
  const run = async () => {
    const docs = await loadIndex();
    renderResults(pageResults, search(pageInput.value, docs), pageInput.value);
  };
  pageInput.value = new URLSearchParams(location.search).get('q') ?? '';
  pageInput.addEventListener('input', run);
  void run();
}
