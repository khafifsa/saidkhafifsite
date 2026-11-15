import { raw, type Html } from '../../lib/jsx/jsx-runtime';
import { count, WORDS } from '../../lib/arabic';
import { LECTURE_KINDS, isReadable, splitLines, type Course, type LectureKind } from '../../lib/schema';
import type { Store } from '../content';
import { url } from '../ctx';
import { itemPath } from '../feed';
import { Layout } from '../components/layout';
import { AnnouncementItem, CourseCard, DocRow } from '../components/cards';
import { DownloadLink, Empty, Icon, Ltr, PageHead, ReadLink, SampleBadge, SectionTitle, ShareBar } from '../components/ui';
import { Reader } from '../components/reader';
import { fileMeta } from '../feed';

export function CoursesIndex(store: Store): Html {
  const groups = new Map<string, Course[]>();
  for (const c of store.courses) groups.set(c.institution ?? '', [...(groups.get(c.institution ?? '') ?? []), c]);
  const ordered = [
    ...store.site.institutions.filter((i) => groups.has(i.id)).map((i) => [i.id, groups.get(i.id)!] as const),
    ...[...groups.entries()].filter(([k]) => !store.institutionById.has(k)),
  ];
  return (
    <Layout title="المقررات الدراسية" path="courses/" nav="courses" description="جميع المقررات الدراسية مع محاضراتها ووثائقها.">
      <PageHead
        title="المقررات الدراسية"
        crumbs={[{ label: 'المقررات' }]}
        lead="اختر مقررك للاطلاع على المحاضرات والأعمال التوجيهية والوثائق المرتبطة به، وقراءتها أو تحميلها."
      />
      <div class="container section">
        {ordered.length ? (
          ordered.map(([instId, courses]) => {
            const inst = store.institutionById.get(instId);
            return (
              <section class="mb-2" style="margin-bottom:2.5rem">
                <SectionTitle title={inst ? inst.name : 'مقررات أخرى'} />
                {inst?.university ? <p class="muted" style="margin:-.75rem 0 1rem">{inst.university}</p> : null}
                <div class="course-grid">
                  {courses.map((c) => (
                    <CourseCard course={c} />
                  ))}
                </div>
              </section>
            );
          })
        ) : (
          <Empty text="لم تتم إضافة أي مقرر بعد." icon="course" />
        )}
      </div>
    </Layout>
  );
}

const KIND_ORDER: LectureKind[] = ['lecture', 'handout', 'td', 'summary', 'exam', 'document'];
const KIND_TITLES: Record<LectureKind, string> = {
  lecture: 'المحاضرات',
  handout: 'المطبوعات',
  td: 'الأعمال التوجيهية',
  summary: 'الملخصات',
  exam: 'امتحانات سابقة',
  document: 'وثائق أخرى',
};

export function CoursePage(store: Store, course: Course): Html {
  const inst = course.institution ? store.institutionById.get(course.institution) : undefined;
  const docs = store.lecturesByCourse.get(course.id) ?? [];
  const announcements = store.announcements.filter((a) => a.course === course.id).slice(0, 4);
  const syllabus = splitLines(course.syllabus);
  const groups = KIND_ORDER.map((k) => ({ kind: k, items: docs.filter((d) => (d.kind ?? 'lecture') === k) })).filter((g) => g.items.length);
  const path = itemPath.course(course.id);

  return (
    <Layout title={course.title} path={path} nav="courses" description={course.description}>
      <PageHead
        title={course.title}
        crumbs={[{ href: 'courses/', label: 'المقررات' }, { label: course.title }]}
        meta={
          <>
            {inst ? (
              <span>
                <Icon name="landmark" />
                {inst.name}
              </span>
            ) : null}
            {course.level ? (
              <span>
                <Icon name="layers" />
                {course.level}
              </span>
            ) : null}
            {course.year ? (
              <span>
                <Icon name="calendar" />
                السنة الجامعية <Ltr>{course.year}</Ltr>
              </span>
            ) : null}
            <span>
              <Icon name="fileText" />
              {docs.length ? count(docs.length, WORDS.document) : 'لا توجد وثائق بعد'}
            </span>
          </>
        }
      />
      <div class="container section two-col">
        <div>
          {course.description ? (
            <section class="mb-2" style="margin-bottom:2rem">
              <SectionTitle title="تقديم المقرر" />
              <p style="font-size:1.05rem;line-height:1.95">{course.description}</p>
            </section>
          ) : null}

          {syllabus.length ? (
            <section style="margin-bottom:2rem">
              <SectionTitle title="محاور المقرر" />
              <ol class="syllabus">
                {syllabus.map((s) => (
                  <li>{s}</li>
                ))}
              </ol>
            </section>
          ) : null}

          {course.file ? (
            <div class="handout" data-tone="brass">
              <span class="stat-icon">
                <Icon name="notebook" />
              </span>
              <div class="grow">
                <strong>المطبوع الكامل للمقرر</strong>
                <small>{fileMeta(course.file).join(' · ')}</small>
              </div>
              {isReadable(course.file) ? <ReadLink href={`${path}read/`} /> : null}
              <DownloadLink file={course.file} />
            </div>
          ) : null}

          {groups.length ? (
            groups.map((g) => (
              <section style="margin-bottom:2rem">
                <SectionTitle title={groups.length > 1 || g.kind !== 'lecture' ? KIND_TITLES[g.kind] : 'المحاضرات والوثائق'} />
                <ol class="doc-list" role="list">
                  {g.items.map((l, i) => (
                    <DocRow lecture={l} number={g.kind === 'lecture' ? l.order ?? i + 1 : undefined} />
                  ))}
                </ol>
              </section>
            ))
          ) : (
            <Empty text="لم تُنشر وثائق في هذا المقرر بعد." icon="lecture" />
          )}
        </div>

        <aside>
          <div class="side-card">
            <h3>
              <Icon name="info" />
              بطاقة المقرر
            </h3>
            <dl class="kv">
              {inst ? (
                <>
                  <dt>المؤسسة</dt>
                  <dd>{inst.name}</dd>
                </>
              ) : null}
              {course.level ? (
                <>
                  <dt>المستوى</dt>
                  <dd>{course.level}</dd>
                </>
              ) : null}
              {course.year ? (
                <>
                  <dt>السنة</dt>
                  <dd>
                    <Ltr>{course.year}</Ltr>
                  </dd>
                </>
              ) : null}
              <dt>الوثائق</dt>
              <dd>{docs.length}</dd>
              {groups.map((g) => (
                <>
                  <dt>{LECTURE_KINDS[g.kind]}</dt>
                  <dd>{g.items.length}</dd>
                </>
              ))}
            </dl>
            <SampleBadge show={course.sample} />
          </div>
          <div class="side-card">
            <h3>
              <Icon name="share" />
              شارك المقرر مع زملائك
            </h3>
            <ShareBar title={course.title} path={path} />
          </div>
          {announcements.length ? (
            <div class="side-card">
              <h3>
                <Icon name="announcement" />
                إعلانات المقرر
              </h3>
              <ul class="side-list">
                {announcements.map((a) => (
                  <li>
                    <a href={url(itemPath.announcement(a.id))}>
                      <Icon name="pinned" />
                      <span class="grow">{a.title}</span>
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

/** Reader page for a course's complete handout. */
export function CourseHandoutPage(store: Store, course: Course): Html {
  const path = `${itemPath.course(course.id)}read/`;
  const file = course.file!;
  return (
    <Layout title={`المطبوع الكامل — ${course.title}`} path={path} nav="courses" reader={file.type === 'pdf'}>
      <PageHead
        title={`المطبوع الكامل: ${course.title}`}
        crumbs={[
          { href: 'courses/', label: 'المقررات' },
          { href: itemPath.course(course.id), label: course.title },
          { label: 'المطبوع' },
        ]}
        meta={<span>{fileMeta(file).join(' · ')}</span>}
      />
      <div class="container section" style="padding-top:0">
        <div class="reader-actions">
          <DownloadLink file={file} class="btn btn-primary" label="تحميل المطبوع" />
          <span class="spacer"></span>
          <ShareBar title={course.title} path={path} />
        </div>
        <Reader file={file} title={course.title} />
      </div>
    </Layout>
  );
}

export { raw, AnnouncementItem };
