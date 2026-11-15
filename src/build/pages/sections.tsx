import { raw, type Html } from '../../lib/jsx/jsx-runtime';
import { normalize } from '../../lib/arabic';
import { readingTime, stripHtml } from '../../lib/format';
import {
  PUBLICATION_KINDS,
  displayName,
  forName,
  isReadable,
  splitLines,
  splitTags,
  type Announcement,
  type Article,
  type Book,
  type Publication,
  type PublicationKind,
} from '../../lib/schema';
import type { Store } from '../content';
import { url } from '../ctx';
import { fileMeta, itemPath } from '../feed';
import { Layout } from '../components/layout';
import { AnnouncementItem, ArticleCard, BookCard, BookCover, PublicationItem } from '../components/cards';
import { DateText, DownloadLink, Emblem, Empty, Icon, PageHead, Portrait, SampleBadge, SectionTitle, ShareBar } from '../components/ui';
import { Reader } from '../components/reader';
import { richHtml } from '../components/rich';

/* ------------------------------------------------------------ articles */

export function ArticlesIndex(store: Store): Html {
  return (
    <Layout title="المقالات" path="articles/" nav="articles" description="مقالات وقراءات في القانون والتواصل.">
      <PageHead title="المقالات" crumbs={[{ label: 'المقالات' }]} lead="مقالات وقراءات تحليلية، متاحة للقراءة والمشاركة." />
      <div class="container section">
        {store.articles.length ? (
          <div class="article-grid">
            {store.articles.map((a) => (
              <ArticleCard article={a} />
            ))}
          </div>
        ) : (
          <Empty text="لم يُنشر أي مقال بعد." icon="article" />
        )}
      </div>
    </Layout>
  );
}

export function ArticlePage(store: Store, a: Article): Html {
  const text = stripHtml(a.body ?? '');
  const path = itemPath.article(a.id);
  const tags = splitTags(a.tags);
  const others = store.articles.filter((x) => x.id !== a.id).slice(0, 5);
  return (
    <Layout title={a.title} path={path} nav="articles" description={a.summary} ogType="article" ogImage={a.cover} progress>
      <PageHead
        title={a.title}
        crumbs={[{ href: 'articles/', label: 'المقالات' }, { label: a.title }]}
        meta={
          <>
            <span>
              <Icon name="user" />
              {displayName(store.site)}
            </span>
            <span>
              <Icon name="calendar" />
              <DateText iso={a.date} />
            </span>
            <span>
              <Icon name="clock" />
              مدة القراءة: {readingTime(text)}
            </span>
            <SampleBadge show={a.sample} />
          </>
        }
      />
      <div class="container section article-layout">
        <article>
          {a.cover ? <img class="article-cover" src={url(a.cover)} alt="" /> : null}
          {a.summary ? (
            <p class="prose" style="font-weight:600;color:var(--text-2);margin-bottom:1.25rem">
              {a.summary}
            </p>
          ) : null}
          <div class="prose">{raw(richHtml(a.body ?? ''))}</div>
          {tags.length ? (
            <div class="tags mt-3">
              {tags.map((t) => (
                <span class="tag">#{t}</span>
              ))}
            </div>
          ) : null}
          {a.file ? (
            <div class="handout mt-3" data-tone="brass">
              <span class="stat-icon">
                <Icon name="download" />
              </span>
              <div class="grow">
                <strong>نسخة قابلة للتحميل</strong>
                <small>{fileMeta(a.file).join(' · ')}</small>
              </div>
              <DownloadLink file={a.file} />
            </div>
          ) : null}
        </article>
        <aside>
          <div class="side-card">
            <h3>
              <Icon name="share" />
              شارك المقال
            </h3>
            <ShareBar title={a.title} path={path} />
          </div>
          {others.length ? (
            <div class="side-card">
              <h3>
                <Icon name="article" />
                مقالات أخرى
              </h3>
              <ul class="side-list">
                {others.map((o) => (
                  <li>
                    <a href={url(itemPath.article(o.id))}>
                      <span class="grow">
                        {o.title}
                        <small>
                          <DateText iso={o.date} />
                        </small>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </Layout>
  );
}

/* ------------------------------------------------------------ books */

export function BooksIndex(store: Store): Html {
  return (
    <Layout title="المؤلفات" path="books/" nav="books" description="الكتب والمؤلفات المنشورة.">
      <PageHead title="المؤلفات" crumbs={[{ label: 'المؤلفات' }]} lead="الكتب والمؤلفات المنشورة، مع إمكانية الاطلاع والتحميل حين تتوفر نسخة رقمية." />
      <div class="container section">
        {store.books.length ? (
          <div class="book-grid">
            {store.books.map((b) => (
              <BookCard book={b} />
            ))}
          </div>
        ) : (
          <Empty text="لم تتم إضافة مؤلفات بعد." icon="book" />
        )}
      </div>
    </Layout>
  );
}

export function BookPage(store: Store, b: Book): Html {
  const path = itemPath.book(b.id);
  const rows: [string, string | undefined][] = [
    ['المؤلف', displayName(store.site)],
    ['بالاشتراك مع', b.coauthors],
    ['دار النشر', b.publisher],
    ['سنة النشر', b.year],
    ['الطبعة', b.edition],
    ['عدد الصفحات', b.pages],
    ['ردمك (ISBN)', b.isbn],
  ];
  return (
    <Layout title={b.title} path={path} nav="books" description={b.description} ogImage={b.cover} reader={b.file?.type === 'pdf'}>
      <PageHead title={b.title} crumbs={[{ href: 'books/', label: 'المؤلفات' }, { label: b.title }]} meta={<SampleBadge show={b.sample} />} />
      <div class="container section">
        <div class="book-detail">
          <BookCover book={b} />
          <div>
            <dl class="kv" style="font-size:1rem;margin-bottom:1.25rem">
              {rows
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <>
                    <dt>{k}</dt>
                    <dd class={k === 'ردمك (ISBN)' ? 'ltr' : undefined}>{v}</dd>
                  </>
                ))}
            </dl>
            {b.description ? (
              <div class="prose" style="font-size:1.06rem">
                {splitLines(b.description).map((p) => (
                  <p>{p}</p>
                ))}
              </div>
            ) : null}
            <div class="reader-actions">
              {b.file ? <DownloadLink file={b.file} class="btn btn-primary" label="تحميل النسخة الرقمية" /> : null}
              {b.link ? (
                <a class="btn btn-ghost" href={b.link} target="_blank" rel="noopener">
                  <Icon name="external" />
                  رابط الاقتناء أو الاطلاع
                </a>
              ) : null}
            </div>
            <ShareBar title={b.title} path={path} />
          </div>
        </div>
        {b.file && isReadable(b.file) ? (
          <section class="mt-3">
            <SectionTitle title="تصفّح الكتاب" />
            <Reader file={b.file} title={b.title} />
          </section>
        ) : null}
      </div>
    </Layout>
  );
}

/* ------------------------------------------------------------ publications */

export function PublicationsIndex(store: Store): Html {
  const years = new Map<string, Publication[]>();
  for (const p of store.publications) {
    const y = p.year || p.date.slice(0, 4);
    years.set(y, [...(years.get(y) ?? []), p]);
  }
  const kinds = (Object.keys(PUBLICATION_KINDS) as PublicationKind[]).filter((k) => store.publications.some((p) => (p.kind ?? 'article') === k));
  return (
    <Layout title="الأبحاث والمنشورات العلمية" path="publications/" nav="publications" description="المقالات المحكّمة والمداخلات والفصول المنشورة.">
      <PageHead
        title="الأبحاث والمنشورات العلمية"
        crumbs={[{ label: 'الأبحاث' }]}
        lead="المقالات المحكّمة والمداخلات العلمية والفصول المنشورة، مرتبة حسب السنة."
      />
      <div class="container section narrow" style="width:min(100% - 2rem, 60rem)">
        {store.publications.length ? (
          <>
            {kinds.length > 1 ? (
              <div class="chips mb-2" role="toolbar" aria-label="نوع المنشور" data-pub-filters>
                <button type="button" class="chip" data-pub-kind="" aria-pressed="true">
                  الكل
                </button>
                {kinds.map((k) => (
                  <button type="button" class="chip" data-pub-kind={k} aria-pressed="false">
                    {PUBLICATION_KINDS[k]}
                  </button>
                ))}
              </div>
            ) : null}
            {[...years.entries()].map(([year, pubs]) => (
              <section data-pub-year>
                <h2 class="pub-year">{year}</h2>
                <ul class="pub-list">
                  {pubs.map((p) => (
                    <PublicationItem pub={p} />
                  ))}
                </ul>
              </section>
            ))}
          </>
        ) : (
          <Empty text="لم تتم إضافة أبحاث بعد." icon="publication" />
        )}
      </div>
    </Layout>
  );
}

export function PublicationPage(store: Store, p: Publication): Html {
  const path = itemPath.publication(p.id);
  const venue = [p.venue, p.issue ? `العدد ${p.issue}` : '', p.pages, p.year].filter(Boolean).join('، ');
  return (
    <Layout title={p.title} path={path} nav="publications" description={p.abstract} ogType="article" reader={p.file?.type === 'pdf'}>
      <PageHead
        title={p.title}
        crumbs={[{ href: 'publications/', label: 'الأبحاث' }, { label: p.title }]}
        meta={
          <>
            <span class="badge">{PUBLICATION_KINDS[p.kind ?? 'article']}</span>
            {venue ? (
              <span>
                <Icon name="library" />
                {venue}
              </span>
            ) : null}
            {p.coauthors ? (
              <span>
                <Icon name="users" />
                بالاشتراك مع: {p.coauthors}
              </span>
            ) : null}
            <SampleBadge show={p.sample} />
          </>
        }
      />
      <div class="container section" style="padding-top:0">
        <div class="reader-actions">
          {p.file ? <DownloadLink file={p.file} class="btn btn-primary" label="تحميل البحث" /> : null}
          {p.link ? (
            <a class="btn btn-ghost" href={p.link} target="_blank" rel="noopener">
              <Icon name="external" />
              رابط المنشور
            </a>
          ) : null}
          <span class="spacer"></span>
          <ShareBar title={p.title} path={path} />
        </div>
        {p.abstract ? (
          <section class="doc-paper" style="margin-bottom:1.5rem">
            <h2 style="font-size:1.3rem;margin-bottom:.5rem">ملخص البحث</h2>
            <div class="prose" style="font-size:1.06rem">
              {splitLines(p.abstract).map((x) => (
                <p>{x}</p>
              ))}
            </div>
          </section>
        ) : null}
        {p.file ? <Reader file={p.file} title={p.title} /> : null}
      </div>
    </Layout>
  );
}

/* ------------------------------------------------------------ announcements */

export function AnnouncementsIndex(store: Store): Html {
  return (
    <Layout title="الإعلانات" path="announcements/" nav="announcements" description="آخر الإعلانات الموجهة للطلبة.">
      <PageHead title="الإعلانات" crumbs={[{ label: 'الإعلانات' }]} lead="مواعيد الحصص والامتحانات وكل جديد يهم الطلبة." />
      <div class="container section narrow" style="width:min(100% - 2rem, 56rem)">
        {store.announcements.length ? (
          <ul class="ann-list">
            {store.announcements.map((a) => (
              <AnnouncementItem item={a} />
            ))}
          </ul>
        ) : (
          <Empty text="لا توجد إعلانات حالياً." icon="announcement" />
        )}
      </div>
    </Layout>
  );
}

export function AnnouncementPage(store: Store, a: Announcement): Html {
  const path = itemPath.announcement(a.id);
  const course = a.course ? store.courseById.get(a.course) : undefined;
  return (
    <Layout title={a.title} path={path} nav="announcements" description={stripHtml(a.body ?? '').slice(0, 160)}>
      <PageHead
        title={a.title}
        crumbs={[{ href: 'announcements/', label: 'الإعلانات' }, { label: a.title }]}
        meta={
          <>
            <span>
              <Icon name="calendar" />
              <DateText iso={a.date} />
            </span>
            {course ? (
              <span>
                <Icon name="course" />
                <a href={url(itemPath.course(course.id))} style="color:inherit">
                  {course.title}
                </a>
              </span>
            ) : null}
            <SampleBadge show={a.sample} />
          </>
        }
      />
      <div class="container section narrow" style="width:min(100% - 2rem, 50rem)">
        {a.body ? <div class="prose doc-paper">{raw(richHtml(a.body))}</div> : null}
        <div class="reader-actions">
          {a.file ? <DownloadLink file={a.file} class="btn btn-primary" label="تحميل المرفق" /> : null}
          {a.link ? (
            <a class="btn btn-ghost" href={a.link} target="_blank" rel="noopener">
              <Icon name="external" />
              فتح الرابط
            </a>
          ) : null}
          <span class="spacer"></span>
          <ShareBar title={a.title} path={path} />
        </div>
      </div>
    </Layout>
  );
}

/* ------------------------------------------------------------ about */

export function AboutPage(store: Store): Html {
  const s = store.site;
  const name = displayName(s);
  const education = splitLines(s.education);
  const positions = splitLines(s.positions);
  const interests = splitTags(s.interests);
  return (
    <Layout title="السيرة العلمية" path="about/" nav="about" description={`السيرة العلمية ${forName(name)}.`}>
      <PageHead title="السيرة العلمية" crumbs={[{ label: 'السيرة العلمية' }]} />
      <div class="container section about-grid">
        <aside class="about-card side-card">
          <Portrait src={s.portrait} name={s.name} />
          <h2>{name}</h2>
          <p class="muted">{[s.title, s.specialty].filter(Boolean).join(' — ')}</p>
          <div class="contact-lines mt-2" style="text-align:start">
            {s.institutions.map((i) => (
              <p>
                <Icon name="landmark" />
                <span>{[i.name, i.university].filter(Boolean).join(' — ')}</span>
              </p>
            ))}
            {s.email ? (
              <p>
                <Icon name="mail" />
                <a class="ltr" href={`mailto:${s.email}`}>
                  {s.email}
                </a>
              </p>
            ) : null}
            {s.officeHours ? (
              <p>
                <Icon name="clock" />
                <span>{s.officeHours}</span>
              </p>
            ) : null}
            {(s.links ?? [])
              .filter((l) => l.url && l.label)
              .map((l) => (
                <p>
                  <Icon name="globe" />
                  <a href={l.url} target="_blank" rel="noopener">
                    {l.label}
                  </a>
                </p>
              ))}
          </div>
        </aside>
        <div>
          {s.bio ? (
            <section class="about-section">
              <SectionTitle title="نبذة تعريفية" />
              <div class="prose">{raw(richHtml(s.bio))}</div>
            </section>
          ) : null}
          {education.length ? (
            <section class="about-section">
              <SectionTitle title="المسار الدراسي" />
              <ul class="timeline">
                {education.map((e) => (
                  <li>{e}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {positions.length ? (
            <section class="about-section">
              <SectionTitle title="المسار المهني والمسؤوليات" />
              <ul class="timeline">
                {positions.map((e) => (
                  <li>{e}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {interests.length ? (
            <section class="about-section">
              <SectionTitle title="مجالات البحث" />
              <div class="tags">
                {interests.map((t) => (
                  <span class="tag">{t}</span>
                ))}
              </div>
            </section>
          ) : null}
          {!s.bio && !education.length && !positions.length ? <Empty text="ستُضاف السيرة العلمية قريباً." icon="user" /> : null}
        </div>
      </div>
    </Layout>
  );
}

/* ------------------------------------------------------------ 404 + admin + search */

export function NotFoundPage(): Html {
  return (
    <Layout title="الصفحة غير موجودة" path="404.html" noindex>
      <div class="container not-found">
        <Emblem id="nf" />
        <p class="code">404</p>
        <h1>الصفحة التي تبحث عنها غير موجودة</h1>
        <p class="muted mt-1">ربما تم نقلها أو حذفها. يمكنك العودة إلى الصفحة الرئيسية أو البحث في الموقع.</p>
        <div class="hero-actions" style="justify-content:center">
          <a class="btn btn-primary" href={url('')}>
            <Icon name="home" />
            الصفحة الرئيسية
          </a>
          <button type="button" class="btn btn-ghost" data-search-open>
            <Icon name="search" />
            البحث في الموقع
          </button>
        </div>
      </div>
    </Layout>
  );
}

export function SearchPage(): Html {
  return (
    <Layout title="البحث" path="search/" noindex>
      <PageHead title="البحث في الموقع" crumbs={[{ label: 'البحث' }]} />
      <div class="container section narrow">
        <div class="filters">
          <label class="field-inline">
            <Icon name="search" />
            <input type="search" placeholder="اكتب عبارة البحث…" data-search-page autofocus aria-label="عبارة البحث" />
          </label>
        </div>
        <div class="search-results" data-search-page-results style="max-height:none;padding:0"></div>
      </div>
    </Layout>
  );
}

export { normalize };
