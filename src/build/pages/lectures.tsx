import type { Html } from '../../lib/jsx/jsx-runtime';
import { LECTURE_KINDS, type Lecture, type LectureKind } from '../../lib/schema';
import type { Store } from '../content';
import { url } from '../ctx';
import { itemPath, fileMeta } from '../feed';
import { Layout } from '../components/layout';
import { DocRow } from '../components/cards';
import { DateText, DownloadLink, Empty, Icon, PageHead, SampleBadge, SectionTitle, ShareBar, type Crumb } from '../components/ui';
import { Reader } from '../components/reader';

export function LecturesIndex(store: Store): Html {
  const kinds = (Object.keys(LECTURE_KINDS) as LectureKind[]).filter((k) => store.lectures.some((l) => (l.kind ?? 'lecture') === k));
  return (
    <Layout title="المحاضرات والوثائق" path="lectures/" nav="lectures" description="جميع المحاضرات والمطبوعات والأعمال التوجيهية للقراءة والتحميل.">
      <PageHead
        title="المحاضرات والوثائق"
        crumbs={[{ label: 'المحاضرات' }]}
        lead="كل المحاضرات والمطبوعات والأعمال التوجيهية في مكان واحد: اقرأها داخل الموقع أو حمّلها على جهازك."
      />
      <div class="container section">
        {store.lectures.length ? (
          <>
            <div class="filters" data-doc-filters>
              <label class="field-inline">
                <Icon name="search" />
                <input type="search" placeholder="ابحث بالعنوان أو المقرر…" data-filter-text aria-label="بحث في الوثائق" />
              </label>
              {store.courses.length > 1 ? (
                <select class="select" data-filter-course aria-label="المقرر">
                  <option value="">كل المقررات</option>
                  {store.courses.map((c) => (
                    <option value={c.id}>{c.title}</option>
                  ))}
                </select>
              ) : null}
              {kinds.length > 1 ? (
                <div class="chips" role="toolbar" aria-label="نوع الوثيقة">
                  <button type="button" class="chip" data-filter-kind="" aria-pressed="true">
                    الكل
                  </button>
                  {kinds.map((k) => (
                    <button type="button" class="chip" data-filter-kind={k} aria-pressed="false">
                      {LECTURE_KINDS[k]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <ol class="doc-list" role="list" data-doc-list>
              {store.lectures.map((l) => (
                <DocRow lecture={l} showCourse />
              ))}
            </ol>
            <div class="empty mt-2" data-doc-empty hidden>
              <p>لا توجد وثائق مطابقة لبحثك.</p>
            </div>
          </>
        ) : (
          <Empty text="لم تُنشر أي محاضرة بعد." icon="lecture" />
        )}
      </div>
    </Layout>
  );
}

export function LecturePage(store: Store, lecture: Lecture): Html {
  const course = lecture.course ? store.courseById.get(lecture.course) : undefined;
  const siblings = course ? store.lecturesByCourse.get(course.id) ?? [] : [];
  const index = siblings.findIndex((l) => l.id === lecture.id);
  const prev = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : undefined;
  const path = itemPath.lecture(lecture.id);
  const crumbs: Crumb[] = course
    ? [{ href: 'courses/', label: 'المقررات' }, { href: itemPath.course(course.id), label: course.title }, { label: lecture.title }]
    : [{ href: 'lectures/', label: 'المحاضرات' }, { label: lecture.title }];
  const file = lecture.file;
  const others = siblings.filter((l) => l.id !== lecture.id).slice(0, 6);

  return (
    <Layout
      title={lecture.title}
      path={path}
      nav={course ? 'courses' : 'lectures'}
      description={lecture.description || (course ? `${LECTURE_KINDS[lecture.kind ?? 'lecture']} — ${course.title}` : undefined)}
      ogType="article"
      ogImage={lecture.thumb}
      reader={file?.type === 'pdf'}
    >
      <PageHead
        title={lecture.title}
        crumbs={crumbs}
        meta={
          <>
            <span class="badge">{LECTURE_KINDS[lecture.kind ?? 'lecture']}</span>
            {course ? (
              <span>
                <Icon name="course" />
                <a href={url(itemPath.course(course.id))} style="color:inherit">
                  {course.title}
                </a>
              </span>
            ) : null}
            <span>
              <Icon name="calendar" />
              <DateText iso={lecture.date} />
            </span>
            {file ? (
              <span>
                <Icon name="fileText" />
                {fileMeta(file).join(' · ')}
              </span>
            ) : null}
            <SampleBadge show={lecture.sample} />
          </>
        }
      />
      <div class="container section" style="padding-top:0">
        <div class="reader-actions">
          {file ? <DownloadLink file={file} class="btn btn-primary" label="تحميل الملف" /> : null}
          {file ? (
            <a class="btn btn-ghost" href={url(file.path)} target="_blank" rel="noopener">
              <Icon name="external" />
              فتح في نافذة جديدة
            </a>
          ) : null}
          <span class="spacer"></span>
          <ShareBar title={lecture.title} path={path} />
        </div>
        {lecture.description ? <p style="margin-bottom:1.25rem;font-size:1.05rem;color:var(--text-2)">{lecture.description}</p> : null}
        {file ? <Reader file={file} title={lecture.title} /> : <Empty text="لا يوجد ملف مرفق بهذه الوثيقة." />}

        {prev || next ? (
          <nav class="reader-nav" aria-label="التنقل بين وثائق المقرر">
            {prev ? (
              <a href={url(itemPath.lecture(prev.id))}>
                <small>
                  <Icon name="arrowRight" />
                  السابق
                </small>
                {prev.title}
              </a>
            ) : (
              <span></span>
            )}
            {next ? (
              <a class="next" href={url(itemPath.lecture(next.id))}>
                <small>
                  التالي
                  <Icon name="arrowLeft" />
                </small>
                {next.title}
              </a>
            ) : null}
          </nav>
        ) : null}

        {others.length ? (
          <section class="mt-3">
            <SectionTitle title={`وثائق أخرى من «${course!.title}»`} more={{ href: itemPath.course(course!.id), label: 'كل وثائق المقرر' }} />
            <ol class="doc-list" role="list">
              {others.map((l) => (
                <DocRow lecture={l} />
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </Layout>
  );
}
