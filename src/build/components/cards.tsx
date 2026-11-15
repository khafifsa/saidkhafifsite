import { raw, type Html } from '../../lib/jsx/jsx-runtime';
import { count, WORDS } from '../../lib/arabic';
import { excerpt, formatDate, formatSize, pagesLabel, stripHtml } from '../../lib/format';
import type { IconName } from '../../lib/icons';
import {
  LECTURE_KINDS,
  PUBLICATION_KINDS,
  TYPE_META,
  displayName,
  isReadable,
  type Announcement,
  type Article,
  type Book,
  type Course,
  type Lecture,
  type Publication,
} from '../../lib/schema';
import { url } from '../ctx';
import { itemPath, type FeedEntry } from '../feed';
import { getStore } from '../state';
import { DateBlock, DateText, DownloadLink, Emblem, FileType, Icon, Ltr, ReadLink, SampleBadge, Star, TypeBadge } from './ui';
import { richHtml } from './rich';

export function StatTile(props: { n: number; label: string; icon: IconName; tone: string; href: string }): Html {
  return (
    <a class="stat" href={url(props.href)} data-tone={props.tone}>
      <span class="stat-icon">
        <Icon name={props.icon} />
      </span>
      <span>
        <span class="stat-num">{props.n}</span>
        <span class="stat-label">{props.label}</span>
      </span>
    </a>
  );
}

export function FeedItem(props: { entry: FeedEntry; hidden?: boolean }): Html {
  const e = props.entry;
  const meta = TYPE_META[e.type];
  const readable = isReadable(e.file);
  return (
    <li class={`feed-item${e.pinned ? ' is-pinned' : ''}`} data-type={e.type} data-tone={meta.tone} hidden={props.hidden}>
      {e.thumb ? (
        <img
          class={`feed-thumb${e.file?.type === 'pptx' || e.file?.type === 'ppt' ? ' wide' : ''}`}
          src={url(e.thumb)}
          alt=""
          loading="lazy"
          decoding="async"
          width={e.file?.type === 'pptx' ? 90 : 84}
          height={e.file?.type === 'pptx' ? 68 : 112}
        />
      ) : (
        <span class="feed-visual">
          <Icon name={meta.icon} />
        </span>
      )}
      <div>
        <div class="feed-head">
          <TypeBadge type={e.type} label={e.label} />
          <DateText iso={e.date} />
          {e.pinned ? (
            <span class="badge" data-tone="red">
              <Icon name="pinned" />
              مثبّت
            </span>
          ) : null}
          <SampleBadge show={e.sample} />
        </div>
        <h3 class="feed-title">
          <a href={url(e.path)}>{e.title}</a>
        </h3>
        {e.meta.length ? (
          <div class="feed-meta">
            {e.meta.map((m) => (
              <span>{m}</span>
            ))}
          </div>
        ) : null}
        {e.excerpt ? <p class="feed-excerpt">{excerpt(e.excerpt, 190)}</p> : null}
        {e.file ? (
          <div class="feed-actions">
            {readable ? <ReadLink href={e.path} /> : null}
            <DownloadLink file={e.file} />
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function CourseCard(props: { course: Course }): Html {
  const store = getStore();
  const c = props.course;
  const inst = c.institution ? store.institutionById.get(c.institution) : undefined;
  const n = store.lecturesByCourse.get(c.id)?.length ?? 0;
  return (
    <article class="course-card">
      <div class="course-top pattern">
        <span class="course-seal" aria-hidden="true">
          <Icon name="course" />
        </span>
      </div>
      <div class="course-body">
        <div class="course-tags">
          {c.level ? (
            <span class="badge" data-tone="emerald">
              {c.level}
            </span>
          ) : null}
          {c.year ? (
            <span class="badge">
              <Ltr>{c.year}</Ltr>
            </span>
          ) : null}
          <SampleBadge show={c.sample} />
        </div>
        <h3>
          <a href={url(itemPath.course(c.id))}>{c.title}</a>
        </h3>
        {c.description ? <p>{excerpt(c.description, 150)}</p> : null}
      </div>
      <div class="course-foot">
        <span>{inst ? inst.short || inst.name : n ? count(n, WORDS.document) : 'لا توجد وثائق بعد'}</span>
        <span class="go">
          {n ? count(n, WORDS.document) : 'الدخول'}
          <Icon name="arrowLeft" />
        </span>
      </div>
    </article>
  );
}

const KIND_ICON: Record<string, IconName> = {
  lecture: 'lecture',
  handout: 'notebook',
  td: 'clipboard',
  exam: 'exam',
  summary: 'summary',
  document: 'doc',
};

export function DocRow(props: { lecture: Lecture; showCourse?: boolean; number?: number }): Html {
  const store = getStore();
  const l = props.lecture;
  const course = props.showCourse && l.course ? store.courseById.get(l.course) : undefined;
  const kind = l.kind ?? 'lecture';
  const searchText = [l.title, LECTURE_KINDS[kind], course?.title, l.description].filter(Boolean).join(' ');
  return (
    <li class="doc-row" data-tone="emerald" data-kind={kind} data-course={l.course ?? ''} data-text={searchText}>
      <span class="doc-num" aria-hidden="true">
        {props.number != null ? props.number : <Icon name={KIND_ICON[kind] ?? 'file'} />}
      </span>
      <div>
        <div class="doc-title">
          <a href={url(itemPath.lecture(l.id))}>{l.title}</a>
        </div>
        <div class="doc-meta">
          <span class="badge" data-tone="emerald">
            {LECTURE_KINDS[kind]}
          </span>
          {course ? <span>{course.title}</span> : null}
          <DateText iso={l.date} />
          <FileType file={l.file} />
          {l.file ? <span>{[pagesLabel(l.file.pages, l.file.type), formatSize(l.file.size)].filter(Boolean).join(' · ')}</span> : null}
          <SampleBadge show={l.sample} />
        </div>
      </div>
      <div class="doc-actions">
        {l.file && isReadable(l.file) ? <ReadLink href={itemPath.lecture(l.id)} /> : null}
        {l.file ? <DownloadLink file={l.file} /> : null}
      </div>
    </li>
  );
}

export function ArticleCard(props: { article: Article }): Html {
  const a = props.article;
  const text = stripHtml(a.body ?? '');
  return (
    <article class="article-card">
      {a.cover ? (
        <img class="cover" src={url(a.cover)} alt="" loading="lazy" decoding="async" />
      ) : (
        <div class="cover-placeholder pattern" aria-hidden="true">
          <Icon name="article" />
        </div>
      )}
      <div class="body">
        <div class="feed-head">
          <DateText iso={a.date} />
          <SampleBadge show={a.sample} />
        </div>
        <h3>
          <a href={url(itemPath.article(a.id))}>{a.title}</a>
        </h3>
        <p>{a.summary ? excerpt(a.summary, 200) : excerpt(text, 200)}</p>
      </div>
    </article>
  );
}

const COVER_TONES = ['#0e4a38', '#6b2233', '#27356f', '#5a4413', '#1f3b44'];

export function BookCover(props: { book: Book }): Html {
  const b = props.book;
  const site = getStore().site;
  if (b.cover) {
    return (
      <div class="book-cover">
        <img src={url(b.cover)} alt={`غلاف ${b.title}`} loading="lazy" decoding="async" />
      </div>
    );
  }
  let h = 0;
  for (const ch of b.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const tone = COVER_TONES[h % COVER_TONES.length];
  return (
    <div class="book-cover" role="img" aria-label={`غلاف ${b.title}`}>
      <div class="gen-cover pattern" style={`--cover-bg:${tone}`}>
        <Emblem id={`bc-${b.id}`} />
        <span class="t">{b.title}</span>
        <span class="a">{displayName(site)}</span>
      </div>
    </div>
  );
}

export function BookCard(props: { book: Book }): Html {
  const b = props.book;
  return (
    <article class="book-card">
      <BookCover book={b} />
      <h3>
        <a href={url(itemPath.book(b.id))}>{b.title}</a>
      </h3>
      <small>{[b.publisher, b.year].filter(Boolean).join(' · ')}</small>
      <SampleBadge show={b.sample} />
    </article>
  );
}

export function PublicationItem(props: { pub: Publication }): Html {
  const p = props.pub;
  const venue = [p.venue, p.issue ? `العدد ${p.issue}` : '', p.pages, p.year].filter(Boolean).join('، ');
  return (
    <li class="pub-item" data-kind={p.kind ?? 'article'}>
      <div class="feed-head">
        <span class="badge" data-tone="indigo">
          {PUBLICATION_KINDS[p.kind ?? 'article']}
        </span>
        <SampleBadge show={p.sample} />
      </div>
      <h3>
        <a href={url(itemPath.publication(p.id))}>{p.title}</a>
      </h3>
      {venue ? <cite class="venue">{venue}</cite> : null}
      {p.coauthors ? <small class="muted">بالاشتراك مع: {p.coauthors}</small> : null}
      <div class="feed-actions">
        {p.file && isReadable(p.file) ? <ReadLink href={itemPath.publication(p.id)} /> : null}
        {p.file ? <DownloadLink file={p.file} /> : null}
        {p.link ? (
          <a class="btn btn-ghost btn-sm" href={p.link} target="_blank" rel="noopener">
            <Icon name="external" />
            رابط المنشور
          </a>
        ) : null}
      </div>
    </li>
  );
}

export function AnnouncementItem(props: { item: Announcement; full?: boolean }): Html {
  const n = props.item;
  const store = getStore();
  const course = n.course ? store.courseById.get(n.course) : undefined;
  return (
    <li class={`ann-item${n.pinned ? ' is-pinned' : ''}`}>
      <DateBlock iso={n.date} />
      <div>
        <div class="feed-head">
          {n.pinned ? (
            <span class="badge" data-tone="red">
              <Icon name="pinned" />
              مثبّت
            </span>
          ) : null}
          {course ? (
            <a class="badge" data-tone="emerald" href={url(itemPath.course(course.id))}>
              {course.title}
            </a>
          ) : null}
          <SampleBadge show={n.sample} />
        </div>
        <h3>
          <a href={url(itemPath.announcement(n.id))}>{n.title}</a>
        </h3>
        {n.body ? <div class="prose mt-1">{raw(richHtml(n.body))}</div> : null}
        {n.file || n.link ? (
          <div class="feed-actions">
            {n.file ? <DownloadLink file={n.file} label="تحميل المرفق" /> : null}
            {n.link ? (
              <a class="btn btn-ghost btn-sm" href={n.link} target="_blank" rel="noopener">
                <Icon name="external" />
                فتح الرابط
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function Notice(props: { item: Announcement }): Html {
  const n = props.item;
  return (
    <div class="notice" role="note">
      <span class="notice-icon">
        <Icon name="announcement" />
      </span>
      <div>
        <h3>
          <a href={url(itemPath.announcement(n.id))}>{n.title}</a>
        </h3>
        <div class="notice-meta">
          إعلان هام · {formatDate(n.date)}
          {n.sample ? ' · نموذج' : ''}
        </div>
      </div>
    </div>
  );
}

export { Star };
