import type { Html } from '../../lib/jsx/jsx-runtime';
import { TYPE_META, displayName, today, type FeedType } from '../../lib/schema';
import { count, WORDS } from '../../lib/arabic';
import type { Store } from '../content';
import { url } from '../ctx';
import { itemPath, type FeedEntry } from '../feed';
import { Layout } from '../components/layout';
import { BookCover, FeedItem, Notice, StatTile } from '../components/cards';
import { Icon, Portrait, SectionTitle, Star } from '../components/ui';

const PAGE_SIZE = 8;

export function HomePage(store: Store, feed: FeedEntry[]): Html {
  const site = store.site;
  const name = displayName(site);
  const now = today();
  const pinned = store.announcements.filter((a) => a.pinned && (!a.until || a.until >= now)).slice(0, 3);
  const types = (Object.keys(TYPE_META) as FeedType[]).filter((t) => feed.some((e) => e.type === t));
  const latestBook = store.books[0];

  const stats = [
    { n: store.courses.length, label: 'المقررات الدراسية', icon: 'course', tone: 'emerald', href: 'courses/' },
    { n: store.lectures.length, label: 'المحاضرات والوثائق', icon: 'lecture', tone: 'emerald', href: 'lectures/' },
    { n: store.articles.length, label: 'المقالات', icon: 'article', tone: 'brass', href: 'articles/' },
    { n: store.books.length, label: 'المؤلفات', icon: 'book', tone: 'wine', href: 'books/' },
    { n: store.publications.length, label: 'الأبحاث العلمية', icon: 'publication', tone: 'indigo', href: 'publications/' },
  ] as const;

  const byInstitution = new Map<string, typeof store.courses>();
  for (const c of store.courses) {
    const key = c.institution ?? '';
    byInstitution.set(key, [...(byInstitution.get(key) ?? []), c]);
  }

  return (
    <Layout title={name} path="" nav="home">
      <section class="hero pattern" aria-labelledby="hero-title">
        <div class="container">
          <div>
            <span class="eyebrow">
              <Star />
              فضاء رقمي مفتوح للطلبة والباحثين
            </span>
            <h1 id="hero-title">{name}</h1>
            <p class="lead">
              {site.tagline || 'محاضرات ومقررات، مقالات ومؤلفات، وأبحاث علمية — في مكان واحد، ومتاحة للجميع.'}
            </p>
            <div class="hero-affs">
              {[site.title, site.specialty].filter(Boolean).length ? (
                <span>
                  <Icon name="scale" />
                  {[site.title, site.specialty].filter(Boolean).join(' — ')}
                </span>
              ) : null}
              {site.institutions.map((i) => (
                <span>
                  <Icon name="landmark" />
                  {i.name}
                </span>
              ))}
            </div>
            <div class="hero-actions">
              <a class="btn btn-gold" href={url('courses/')}>
                <Icon name="course" />
                تصفّح المقررات
              </a>
              <a class="btn btn-outline-light" href="#feed">
                <Icon name="sparkles" />
                آخر المستجدات
              </a>
            </div>
          </div>
          <Portrait src={site.portrait} name={site.name} />
        </div>
      </section>

      <div class="container stats">
        <div class="stats-grid">
          {stats
            .filter((s) => s.n > 0 || s.href === 'courses/' || s.href === 'lectures/')
            .map((s) => (
              <StatTile n={s.n} label={s.label} icon={s.icon} tone={s.tone} href={s.href} />
            ))}
        </div>
        {pinned.length ? (
          <div class="notices">
            {pinned.map((a) => (
              <Notice item={a} />
            ))}
          </div>
        ) : null}
      </div>

      <div class="container home-grid">
        <section id="feed" aria-labelledby="feed-title">
          <SectionTitle id="feed-title" title="آخر المستجدات" />
          {types.length > 1 ? (
            <div class="chips feed-filters" role="toolbar" aria-label="تصفية المستجدات">
              <button type="button" class="chip" data-filter="all" aria-pressed="true">
                الكل <span class="count">{feed.length}</span>
              </button>
              {types.map((t) => (
                <button type="button" class="chip" data-filter={t} aria-pressed="false">
                  {TYPE_META[t].plural} <span class="count">{feed.filter((e) => e.type === t).length}</span>
                </button>
              ))}
            </div>
          ) : null}
          {feed.length ? (
            <ul class="feed-list" data-feed data-page-size={PAGE_SIZE}>
              {feed.slice(0, 80).map((e, i) => (
                <FeedItem entry={e} hidden={i >= PAGE_SIZE} />
              ))}
            </ul>
          ) : (
            <div class="empty">
              <p>لم يُنشر أي محتوى بعد.</p>
            </div>
          )}
          <div class="feed-more">
            <button type="button" class="btn btn-ghost" data-feed-more hidden={feed.length <= PAGE_SIZE}>
              <Icon name="chevronDown" />
              عرض المزيد
            </button>
          </div>
        </section>

        <aside aria-label="روابط جانبية">
          <div class="side-card">
            <h3>
              <Icon name="course" />
              المقررات الدراسية
            </h3>
            {store.courses.length ? (
              [...byInstitution.entries()].map(([instId, courses]) => {
                const inst = store.institutionById.get(instId);
                return (
                  <>
                    {byInstitution.size > 1 || inst ? <p class="side-group">{inst ? inst.short || inst.name : 'مقررات أخرى'}</p> : null}
                    <ul class="side-list">
                      {courses.map((c) => {
                        const n = store.lecturesByCourse.get(c.id)?.length ?? 0;
                        return (
                          <li>
                            <a href={url(itemPath.course(c.id))}>
                              <Icon name="bookmark" />
                              <span class="grow">
                                {c.title}
                                {c.level ? <small>{c.level}</small> : null}
                              </span>
                              <span class="num">{n ? count(n, WORDS.document) : ''}</span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                );
              })
            ) : (
              <p class="muted">ستظهر المقررات هنا بعد إضافتها.</p>
            )}
          </div>

          {latestBook ? (
            <div class="side-card">
              <h3>
                <Icon name="book" />
                أحدث المؤلفات
              </h3>
              <a href={url(itemPath.book(latestBook.id))} style="display:grid;grid-template-columns:96px 1fr;gap:1rem;align-items:center;text-decoration:none;color:inherit">
                <BookCover book={latestBook} />
                <span>
                  <strong style="display:block;color:var(--heading);line-height:1.5">{latestBook.title}</strong>
                  <small class="muted">{[latestBook.publisher, latestBook.year].filter(Boolean).join(' · ')}</small>
                </span>
              </a>
            </div>
          ) : null}

          {site.email || site.officeHours || site.office ? (
            <div class="side-card">
              <h3>
                <Icon name="clock" />
                التواصل والاستقبال
              </h3>
              <div class="contact-lines">
                {site.officeHours ? (
                  <p>
                    <Icon name="calendar" />
                    <span>{site.officeHours}</span>
                  </p>
                ) : null}
                {site.office ? (
                  <p>
                    <Icon name="pin" />
                    <span>{site.office}</span>
                  </p>
                ) : null}
                {site.email ? (
                  <p>
                    <Icon name="mail" />
                    <a class="ltr" href={`mailto:${site.email}`}>
                      {site.email}
                    </a>
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </Layout>
  );
}
