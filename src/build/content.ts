/** Loads, validates and indexes everything under /content. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  COLLECTIONS,
  type Announcement,
  type Article,
  type Book,
  type CollectionName,
  type Course,
  type FileRef,
  type Institution,
  type Lecture,
  type Publication,
  type SiteSettings,
  fileKindFromName,
  today,
} from '../lib/schema';

export interface DocRender {
  html: string;
  text: string;
}

export interface Store {
  site: SiteSettings;
  courses: Course[];
  lectures: Lecture[];
  articles: Article[];
  books: Book[];
  publications: Publication[];
  announcements: Announcement[];
  courseById: Map<string, Course>;
  institutionById: Map<string, Institution>;
  lecturesByCourse: Map<string, Lecture[]>;
  /** Word documents converted to HTML, keyed by file path */
  docs: Map<string, DocRender>;
  warnings: string[];
  sampleCount: number;
}

const DEFAULT_SITE: SiteSettings = {
  honorific: 'الدكتور',
  name: 'اسم الأستاذ',
  institutions: [],
};

function readJson<T>(file: string, warnings: string[]): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch (e) {
    warnings.push(`تعذّرت قراءة ${file}: ${(e as Error).message}`);
    return null;
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function normaliseFile(file: FileRef | undefined, root: string, owner: string, warnings: string[]): FileRef | undefined {
  if (!file || typeof file !== 'object' || !file.path) return undefined;
  const path = String(file.path).replace(/^\/+/, '');
  const abs = join(root, 'public', path);
  if (!existsSync(abs)) {
    warnings.push(`الملف ${path} المرتبط بـ «${owner}» غير موجود.`);
    return undefined;
  }
  return {
    path,
    name: file.name || path.split('/').pop()!,
    size: file.size || statSync(abs).size,
    type: file.type || fileKindFromName(path),
    pages: file.pages,
  };
}

function loadCollection<T extends { id: string; title: string; date: string; hidden?: boolean; file?: FileRef }>(
  root: string,
  name: CollectionName,
  warnings: string[],
): T[] {
  const dir = join(root, 'content', name);
  if (!existsSync(dir)) return [];
  const items: T[] = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.json')) continue;
    const raw = readJson<T>(join(dir, f), warnings);
    if (!raw || typeof raw !== 'object') continue;
    const id = (raw.id || f.replace(/\.json$/, '')).toString();
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) {
      warnings.push(`معرّف غير صالح في ${name}/${f}`);
      continue;
    }
    if (!raw.title || !String(raw.title).trim()) {
      warnings.push(`عنصر بدون عنوان في ${name}/${f}`);
      continue;
    }
    if (raw.hidden) continue;
    const item = { ...raw, id, title: String(raw.title).trim() } as T;
    if (!item.date || !ISO.test(item.date)) item.date = today();
    item.file = normaliseFile(item.file, root, item.title, warnings);
    items.push(item);
  }
  return items;
}

const byDateDesc = (a: { date: string }, b: { date: string }) => b.date.localeCompare(a.date);

export function loadContent(root: string): Store {
  const warnings: string[] = [];
  const siteFile = join(root, 'content', 'site.json');
  const site: SiteSettings = { ...DEFAULT_SITE, ...(readJson<SiteSettings>(siteFile, warnings) ?? {}) };
  site.institutions = (site.institutions ?? []).filter((i) => i && i.name).map((i, n) => ({ ...i, id: i.id || `inst-${n + 1}` }));

  let sampleCount = 0;
  const countSamples = (arr: { sample?: boolean }[]) => (sampleCount += arr.filter((x) => x.sample).length);

  const courses = loadCollection<Course>(root, 'courses', warnings).sort(
    (a, b) => (a.order ?? 999) - (b.order ?? 999) || a.title.localeCompare(b.title, 'ar'),
  );
  const courseIds = new Set(courses.map((c) => c.id));
  const lectures = loadCollection<Lecture>(root, 'lectures', warnings).map((l) => ({
    ...l,
    kind: l.kind ?? 'lecture',
    course: l.course && courseIds.has(l.course) ? l.course : undefined,
    thumb: l.thumb && existsSync(join(root, 'public', l.thumb.replace(/^\/+/, ''))) ? l.thumb.replace(/^\/+/, '') : undefined,
  }));
  lectures.sort(byDateDesc);
  const articles = loadCollection<Article>(root, 'articles', warnings).sort(byDateDesc);
  const books = loadCollection<Book>(root, 'books', warnings).sort(
    (a, b) => (b.year ?? '').localeCompare(a.year ?? '') || byDateDesc(a, b),
  );
  const publications = loadCollection<Publication>(root, 'publications', warnings).sort(
    (a, b) => (b.year ?? b.date.slice(0, 4)).localeCompare(a.year ?? a.date.slice(0, 4)) || byDateDesc(a, b),
  );
  const announcements = loadCollection<Announcement>(root, 'announcements', warnings).sort(
    (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || byDateDesc(a, b),
  );
  for (const arr of [courses, lectures, articles, books, publications, announcements]) countSamples(arr);
  for (const b of [...books, ...articles]) {
    if (b.cover && !existsSync(join(root, 'public', b.cover.replace(/^\/+/, '')))) b.cover = undefined;
  }

  const lecturesByCourse = new Map<string, Lecture[]>();
  for (const l of lectures) {
    if (!l.course) continue;
    const list = lecturesByCourse.get(l.course) ?? [];
    list.push(l);
    lecturesByCourse.set(l.course, list);
  }
  for (const list of lecturesByCourse.values()) {
    list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.date.localeCompare(b.date));
  }

  return {
    site,
    courses,
    lectures,
    articles,
    books,
    publications,
    announcements,
    courseById: new Map(courses.map((c) => [c.id, c])),
    institutionById: new Map(site.institutions.map((i) => [i.id, i])),
    lecturesByCourse,
    docs: new Map(),
    warnings,
    sampleCount,
  };
}

export { COLLECTIONS };
