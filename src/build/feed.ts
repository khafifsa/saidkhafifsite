/** Unified, date-ordered feed of everything published on the site. */
import { normalize } from '../lib/arabic';
import { excerpt, formatSize, pagesLabel, stripHtml } from '../lib/format';
import {
  FILE_KIND_LABELS,
  LECTURE_KINDS,
  PUBLICATION_KINDS,
  TYPE_META,
  type FeedType,
  type FileRef,
} from '../lib/schema';
import type { Store } from './content';

export interface FeedEntry {
  type: FeedType;
  id: string;
  title: string;
  date: string;
  /** site-relative path of the item page */
  path: string;
  label: string;
  meta: string[];
  excerpt?: string;
  file?: FileRef;
  thumb?: string;
  sample?: boolean;
  pinned?: boolean;
  /** extra text used only for search */
  searchText?: string;
}

export const itemPath = {
  course: (id: string) => `courses/${id}/`,
  lecture: (id: string) => `lectures/${id}/`,
  article: (id: string) => `articles/${id}/`,
  book: (id: string) => `books/${id}/`,
  publication: (id: string) => `publications/${id}/`,
  announcement: (id: string) => `announcements/${id}/`,
};

export function fileMeta(file?: FileRef): string[] {
  if (!file) return [];
  return [FILE_KIND_LABELS[file.type], pagesLabel(file.pages, file.type), formatSize(file.size)].filter(Boolean);
}

export function buildFeed(store: Store): FeedEntry[] {
  const out: FeedEntry[] = [];
  for (const l of store.lectures) {
    const course = l.course ? store.courseById.get(l.course) : undefined;
    out.push({
      type: 'lecture',
      id: l.id,
      title: l.title,
      date: l.date,
      path: itemPath.lecture(l.id),
      label: LECTURE_KINDS[l.kind ?? 'lecture'] ?? TYPE_META.lecture.label,
      meta: [course?.title ?? '', ...fileMeta(l.file)].filter(Boolean),
      excerpt: l.description,
      file: l.file,
      thumb: l.thumb,
      sample: l.sample,
      searchText: l.file ? store.docs.get(l.file.path)?.text : undefined,
    });
  }
  for (const a of store.articles) {
    const text = stripHtml(a.body ?? '');
    out.push({
      type: 'article',
      id: a.id,
      title: a.title,
      date: a.date,
      path: itemPath.article(a.id),
      label: TYPE_META.article.label,
      meta: [],
      excerpt: a.summary || excerpt(text, 200),
      file: a.file,
      sample: a.sample,
      searchText: text,
    });
  }
  for (const b of store.books) {
    out.push({
      type: 'book',
      id: b.id,
      title: b.title,
      date: b.date,
      path: itemPath.book(b.id),
      label: TYPE_META.book.label,
      meta: [b.publisher ?? '', b.year ?? ''].filter(Boolean),
      excerpt: b.description ? excerpt(b.description, 200) : undefined,
      file: b.file,
      sample: b.sample,
    });
  }
  for (const p of store.publications) {
    out.push({
      type: 'publication',
      id: p.id,
      title: p.title,
      date: p.date,
      path: itemPath.publication(p.id),
      label: PUBLICATION_KINDS[p.kind ?? 'article'] ?? TYPE_META.publication.label,
      meta: [p.venue ?? '', p.year ?? ''].filter(Boolean),
      excerpt: p.abstract ? excerpt(p.abstract, 200) : undefined,
      file: p.file,
      sample: p.sample,
      searchText: p.file ? store.docs.get(p.file.path)?.text : undefined,
    });
  }
  for (const n of store.announcements) {
    const text = stripHtml(n.body ?? '');
    const course = n.course ? store.courseById.get(n.course) : undefined;
    out.push({
      type: 'announcement',
      id: n.id,
      title: n.title,
      date: n.date,
      path: itemPath.announcement(n.id),
      label: TYPE_META.announcement.label,
      meta: [course?.title ?? ''].filter(Boolean),
      excerpt: text ? excerpt(text, 200) : undefined,
      file: n.file,
      sample: n.sample,
      pinned: n.pinned,
      searchText: text,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'ar'));
}

export interface SearchDoc {
  t: FeedType | 'course';
  l: string;
  ti: string;
  u: string;
  d: string;
  m: string;
  n: string;
}

export function buildSearchIndex(store: Store, feed: FeedEntry[]): SearchDoc[] {
  const docs: SearchDoc[] = feed.map((e) => ({
    t: e.type,
    l: e.label,
    ti: e.title,
    u: e.path,
    d: e.date,
    m: e.meta.slice(0, 2).join(' · '),
    n: normalize([e.title, e.label, e.meta.join(' '), e.excerpt ?? '', (e.searchText ?? '').slice(0, 1500)].join(' ')),
  }));
  for (const c of store.courses) {
    const inst = c.institution ? store.institutionById.get(c.institution) : undefined;
    docs.push({
      t: 'course',
      l: 'مقرر',
      ti: c.title,
      u: itemPath.course(c.id),
      d: c.date,
      m: [inst?.short || inst?.name, c.level].filter(Boolean).join(' · '),
      n: normalize([c.title, c.level, c.year, inst?.name, c.description, c.syllabus].filter(Boolean).join(' ')),
    });
  }
  return docs;
}
