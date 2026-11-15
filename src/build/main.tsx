/**
 * Static site generator entry point (bundled and run by scripts/build.mjs).
 * Reads /content, converts Word files, renders every page to /dist.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { Html } from '../lib/jsx/jsx-runtime';
import { docxToHtml } from '../lib/docx/convert';
import { pptxToHtml } from '../lib/pptx/convert';
import { loadContent, type Store } from './content';
import { absUrl, config, setConfig, url, type BuildConfig } from './ctx';
import { buildFeed, buildSearchIndex, itemPath } from './feed';
import { setStore } from './state';
import { HomePage } from './pages/home';
import { CourseHandoutPage, CoursePage, CoursesIndex } from './pages/courses';
import { LecturePage, LecturesIndex } from './pages/lectures';
import {
  AboutPage,
  AnnouncementPage,
  AnnouncementsIndex,
  ArticlePage,
  ArticlesIndex,
  BookPage,
  BooksIndex,
  NotFoundPage,
  PublicationPage,
  PublicationsIndex,
  SearchPage,
} from './pages/sections';
import { AdminPage } from './pages/admin';

export interface BuildResult {
  pages: number;
  warnings: string[];
  samples: number;
}

async function convertDocs(store: Store): Promise<void> {
  const cfg = config();
  const files = [
    ...store.lectures.map((x) => x.file),
    ...store.publications.map((x) => x.file),
    ...store.books.map((x) => x.file),
    ...store.courses.map((x) => x.file),
  ].filter((f) => f?.type === 'docx' || f?.type === 'pptx');
  const imgDir = join(cfg.outDir, 'assets', 'docx');
  for (const file of files) {
    if (!file || store.docs.has(file.path)) continue;
    try {
      const bytes = new Uint8Array(readFileSync(join(cfg.root, 'public', file.path)));
      const options = {
        inflate: (d: Uint8Array) => new Uint8Array(inflateRawSync(d)),
        imageSrc: (img: { path: string; data: Uint8Array }) => {
          const ext = img.path.split('.').pop()!.toLowerCase();
          const name = createHash('sha1').update(img.data).digest('hex').slice(0, 16) + '.' + ext;
          mkdirSync(imgDir, { recursive: true });
          writeFileSync(join(imgDir, name), img.data);
          return url(`assets/docx/${name}`);
        },
      };
      if (file.type === 'pptx') {
        const result = await pptxToHtml(bytes, options);
        store.docs.set(file.path, { html: result.html, text: result.text });
        if (!file.pages && result.slides) file.pages = result.slides;
        for (const w of result.warnings) store.warnings.push(`${file.name}: ${w}`);
      } else {
        const result = await docxToHtml(bytes, options);
        store.docs.set(file.path, { html: result.html, text: result.text });
        for (const w of result.warnings) store.warnings.push(`${file.name}: ${w}`);
      }
    } catch (e) {
      store.warnings.push(`تعذّر تحويل الملف «${file.name}» إلى نص مقروء: ${(e as Error).message}`);
    }
  }
}

export async function build(cfg: BuildConfig): Promise<BuildResult> {
  setConfig(cfg);
  const store = loadContent(cfg.root);
  setStore(store);
  await convertDocs(store);

  const pages = new Map<string, Html>();
  const add = (path: string, html: Html) => pages.set(path, html);
  const feed = buildFeed(store);

  add('index.html', HomePage(store, feed));
  add('courses/index.html', CoursesIndex(store));
  for (const c of store.courses) {
    add(`${itemPath.course(c.id)}index.html`, CoursePage(store, c));
    if (c.file && ['pdf', 'docx', 'pptx'].includes(c.file.type)) add(`${itemPath.course(c.id)}read/index.html`, CourseHandoutPage(store, c));
  }
  add('lectures/index.html', LecturesIndex(store));
  for (const l of store.lectures) add(`${itemPath.lecture(l.id)}index.html`, LecturePage(store, l));
  add('articles/index.html', ArticlesIndex(store));
  for (const a of store.articles) add(`${itemPath.article(a.id)}index.html`, ArticlePage(store, a));
  add('books/index.html', BooksIndex(store));
  for (const b of store.books) add(`${itemPath.book(b.id)}index.html`, BookPage(store, b));
  add('publications/index.html', PublicationsIndex(store));
  for (const p of store.publications) add(`${itemPath.publication(p.id)}index.html`, PublicationPage(store, p));
  add('announcements/index.html', AnnouncementsIndex(store));
  for (const n of store.announcements) add(`${itemPath.announcement(n.id)}index.html`, AnnouncementPage(store, n));
  add('about/index.html', AboutPage(store));
  add('search/index.html', SearchPage());
  add('404.html', NotFoundPage());
  add('admin/index.html', AdminPage(store));

  for (const [path, html] of pages) {
    const file = join(cfg.outDir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html.value);
  }

  writeFileSync(join(cfg.outDir, 'search-index.json'), JSON.stringify(buildSearchIndex(store, feed)));
  writeFileSync(
    join(cfg.outDir, 'build-info.json'),
    JSON.stringify({ sha: cfg.sha, builtAt: new Date().toISOString(), samples: store.sampleCount }),
  );

  const publicPaths = [...pages.keys()]
    .filter((p) => !p.startsWith('admin/') && !p.startsWith('search/') && p !== '404.html')
    .map((p) => p.replace(/index\.html$/, ''));
  if (cfg.siteUrl) {
    const urls = publicPaths.map((p) => `<url><loc>${absUrl(p)}</loc></url>`).join('');
    writeFileSync(
      join(cfg.outDir, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`,
    );
  }
  writeFileSync(
    join(cfg.outDir, 'robots.txt'),
    `User-agent: *\nDisallow: ${url('admin/')}\n${cfg.siteUrl ? `Sitemap: ${absUrl('sitemap.xml')}\n` : ''}`,
  );

  return { pages: pages.size, warnings: store.warnings, samples: store.sampleCount };
}
