/** @jsxImportSource react */
import { useMemo, useState, type ReactNode } from 'react';
import { count, normalize, WORDS } from '../lib/arabic';
import { formatDate, formatSize, stripHtml } from '../lib/format';
import {
  COLLECTIONS,
  COLLECTION_ORDER,
  FILE_KIND_LABELS,
  LECTURE_KINDS,
  PUBLICATION_KINDS,
  SETTINGS_FIELDS,
  displayName,
  forName,
  today,
  type AnyItem,
  type CollectionName,
  type Course,
  type FieldDef,
  type FileRef,
  type Lecture,
} from '../lib/schema';
import { CONFIG, siteUrl } from './config';
import { itemChangesForDelete, prepareSave, sampleItems, type AdminData } from './data';
import { FormField, type FormModel } from './fields';
import { sanitize } from './files';
import { describeError, type GitHub } from './github';
import { Confirm, Emblem, Icon, Modal, ProgressOverlay, Spinner, useToast } from './ui';

export type Navigate = (hash: string) => void;

/* ================================================================== login */

export function LoginView({ onLogin, error, busy }: { onLogin: (token: string, repo: string, remember: boolean) => void; error?: string; busy: boolean }) {
  const [token, setToken] = useState('');
  const [repo, setRepo] = useState(() => CONFIG.repo || safeGet('admin.repo') || '');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  return (
    <div className="login">
      <form
        className="login-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (token.trim() && repo.trim()) onLogin(token.trim(), repo.trim(), remember);
        }}
      >
        <Emblem size={76} />
        <h1>لوحة التحكم</h1>
        <p className="muted">{CONFIG.name ? `إدارة الموقع العلمي ${forName(CONFIG.name)}` : 'إدارة محتوى الموقع'}</p>
        {!CONFIG.repo ? (
          <label className="field">
            <span className="label">مستودع الموقع على GitHub</span>
            <input dir="ltr" placeholder="username/repository" value={repo} onChange={(e) => setRepo(e.target.value)} required />
          </label>
        ) : null}
        <label className="field">
          <span className="label">مفتاح الدخول</span>
          <span className="pw">
            <input
              type={show ? 'text' : 'password'}
              dir="ltr"
              autoComplete="current-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_…"
              required
            />
            <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? 'إخفاء المفتاح' : 'إظهار المفتاح'}>
              <Icon name={show ? 'eyeOff' : 'eye'} />
            </button>
          </span>
          <small className="help">يُحفظ المفتاح على هذا الجهاز فقط ولا يُرسل إلا إلى GitHub.</small>
        </label>
        <label className="field check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>تذكّرني على هذا الجهاز</span>
        </label>
        {error ? (
          <p className="alert alert-error" role="alert">
            <Icon name="alert" />
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary btn-block" disabled={busy || !token.trim()}>
          {busy ? <Spinner label="جارٍ التحقق…" /> : 'دخول'}
        </button>
        <details className="login-help">
          <summary>كيف أحصل على مفتاح الدخول؟</summary>
          <ol>
            <li>
              افتح{' '}
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">
                صفحة إنشاء مفتاح جديد على GitHub
              </a>{' '}
              بحساب الموقع.
            </li>
            <li>اكتب اسماً للمفتاح (مثلاً: لوحة تحكم الموقع)، واختر مدة الصلاحية «No expiration» أو سنة كاملة.</li>
            <li>في «Repository access» اختر «Only select repositories» ثم حدّد مستودع الموقع.</li>
            <li>في «Repository permissions» اجعل «Contents» على «Read and write»، و«Actions» على «Read-only».</li>
            <li>اضغط «Generate token»، ثم انسخ المفتاح والصقه في الخانة أعلاه.</li>
          </ol>
        </details>
      </form>
    </div>
  );
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/* ================================================================== helpers */

function itemMeta(col: CollectionName, item: AnyItem, data: AdminData): string[] {
  const rec = item as unknown as Record<string, unknown>;
  const out: string[] = [];
  if (item.date) out.push(formatDate(item.date));
  if (col === 'lectures') {
    const l = item as Lecture;
    const course = data.items.courses.find((c) => c.id === l.course);
    out.push(LECTURE_KINDS[l.kind ?? 'lecture']);
    if (course) out.push(course.title);
  }
  if (col === 'courses') {
    const c = item as Course;
    const inst = data.site.institutions.find((i) => i.id === c.institution);
    if (inst) out.push(inst.short || inst.name);
    if (c.level) out.push(c.level);
    const n = data.items.lectures.filter((l) => (l as Lecture).course === c.id).length;
    out.push(n ? count(n, WORDS.document) : 'بدون وثائق');
  }
  if (col === 'publications') {
    const kind = rec.kind as keyof typeof PUBLICATION_KINDS | undefined;
    out.push(PUBLICATION_KINDS[kind ?? 'article']);
    if (rec.year) out.push(String(rec.year));
  }
  if (col === 'books' && rec.year) out.push(String(rec.year));
  const file = rec.file as FileRef | undefined;
  if (file) out.push(`${FILE_KIND_LABELS[file.type] ?? 'ملف'} · ${formatSize(file.size)}`);
  return out.filter(Boolean);
}

function publicPath(col: CollectionName, id: string): string {
  return siteUrl(`${COLLECTIONS[col].route}/${id}/`);
}

function Badges({ item }: { item: AnyItem }) {
  const rec = item as unknown as Record<string, unknown>;
  return (
    <>
      {item.hidden ? <span className="badge badge-draft">مسودة</span> : null}
      {rec.pinned ? (
        <span className="badge badge-pin">
          <Icon name="pinned" />
          مثبّت
        </span>
      ) : null}
      {item.sample ? <span className="badge badge-sample">نموذج</span> : null}
    </>
  );
}

/* ================================================================== home */

export function HomeView({
  data,
  navigate,
  onDeleteSamples,
  storage,
}: {
  data: AdminData;
  navigate: Navigate;
  onDeleteSamples: () => void;
  storage: number | null;
}) {
  const samples = sampleItems(data.items);
  const name = data.site.placeholder ? '' : displayName(data.site);
  const recent = COLLECTION_ORDER.flatMap((col) => data.items[col].map((item) => ({ col, item })))
    .sort((a, b) => (b.item.date ?? '').localeCompare(a.item.date ?? ''))
    .slice(0, 6);
  const quick: { col: CollectionName; label: string; hint: string }[] = [
    { col: 'lectures', label: 'إضافة محاضرة', hint: 'PDF أو Word أو PowerPoint' },
    { col: 'articles', label: 'كتابة مقال', hint: 'أو استيراده من Word' },
    { col: 'announcements', label: 'إضافة إعلان', hint: 'موعد، تذكير…' },
    { col: 'courses', label: 'إضافة مقرر', hint: 'مادة جديدة' },
    { col: 'books', label: 'إضافة مؤلَّف', hint: 'كتاب منشور' },
    { col: 'publications', label: 'إضافة بحث', hint: 'مقال محكّم، مداخلة…' },
  ];
  const limit = 1024 * 1024 * 1024;
  return (
    <div className="view">
      <div className="hello">
        <h1>{name ? `مرحباً بك، ${name}` : 'مرحباً بك في لوحة التحكم'}</h1>
        <p className="muted">ماذا تريد أن تنشر اليوم؟</p>
      </div>
      <div className="quick-grid">
        {quick.map((q) => (
          <button key={q.col} type="button" className="quick" data-col={q.col} onClick={() => navigate(`#/${q.col}/new`)}>
            <span className="quick-icon">
              <Icon name={COLLECTIONS[q.col].icon} />
            </span>
            <strong>{q.label}</strong>
            <small>{q.hint}</small>
          </button>
        ))}
      </div>

      {data.site.placeholder ? (
        <div className="callout">
          <Icon name="user" />
          <div className="grow">
            <strong>أكمل معلومات الموقع</strong>
            <p>الاسم والصفة والصورة الشخصية والنبذة التعريفية تظهر في رأس الموقع وصفحة السيرة العلمية.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => navigate('#/settings')}>
            فتح الإعدادات
          </button>
        </div>
      ) : null}

      {samples.length ? (
        <div className="callout callout-sample">
          <Icon name="sparkles" />
          <div className="grow">
            <strong>يحتوي الموقع على {count(samples.length, WORDS.item)} {samples.length > 10 ? 'تجريبياً' : 'تجريبية'}</strong>
            <p>وُضعت هذه العناصر (المعلَّمة بكلمة «نموذج») لعرض شكل الموقع فقط. احذفها حين تبدأ بإضافة محتواك.</p>
          </div>
          <button type="button" className="btn btn-danger" onClick={onDeleteSamples}>
            <Icon name="trash" />
            حذف المحتوى التجريبي
          </button>
        </div>
      ) : null}

      <div className="home-cols">
        <section className="panel">
          <h2>محتوى الموقع</h2>
          <ul className="counts">
            {COLLECTION_ORDER.map((col) => (
              <li key={col}>
                <a href={`#/${col}`}>
                  <Icon name={COLLECTIONS[col].icon} />
                  <span className="grow">{COLLECTIONS[col].label}</span>
                  <b>{data.items[col].length}</b>
                </a>
              </li>
            ))}
          </ul>
          {storage != null ? (
            <div className="storage">
              <div className="storage-head">
                <span>
                  <Icon name="drive" /> حجم الملفات المرفوعة
                </span>
                <b>
                  {formatSize(storage) || '0'} من 1 غيغابايت
                </b>
              </div>
              <div className="bar">
                <span style={{ width: `${Math.max(1, Math.min(100, (storage / limit) * 100))}%` }} />
              </div>
            </div>
          ) : null}
        </section>
        <section className="panel">
          <h2>آخر ما نُشر</h2>
          {recent.length ? (
            <ul className="recent">
              {recent.map(({ col, item }) => (
                <li key={col + item.id}>
                  <a href={`#/${col}/${item.id}`}>
                    <span className="recent-icon" data-col={col}>
                      <Icon name={COLLECTIONS[col].icon} />
                    </span>
                    <span className="grow">
                      <strong>{item.title}</strong>
                      <small>
                        {COLLECTIONS[col].singular} · {formatDate(item.date)}
                      </small>
                    </span>
                    <Badges item={item} />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">لا يوجد محتوى بعد.</p>
          )}
        </section>
      </div>
    </div>
  );
}

/* ================================================================== list */

export function ListView({
  col,
  data,
  navigate,
  onDelete,
}: {
  col: CollectionName;
  data: AdminData;
  navigate: Navigate;
  onDelete: (col: CollectionName, item: AnyItem) => void;
}) {
  const def = COLLECTIONS[col];
  const [q, setQ] = useState('');
  const items = useMemo(() => {
    const tokens = normalize(q).split(' ').filter(Boolean);
    return data.items[col].filter((item) => {
      if (!tokens.length) return true;
      const hay = normalize([item.title, ...itemMeta(col, item, data)].join(' '));
      return tokens.every((t) => hay.includes(t));
    });
  }, [q, col, data]);

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1>
            <Icon name={def.icon} />
            {def.label}
          </h1>
          <p className="muted">{data.items[col].length ? count(data.items[col].length, WORDS.item) : 'لا توجد عناصر بعد'}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => navigate(`#/${col}/new`)}>
          <Icon name="plus" />
          {def.addLabel}
        </button>
      </div>
      {data.items[col].length > 4 ? (
        <label className="search-field">
          <Icon name="search" />
          <input type="search" placeholder="بحث بالعنوان…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
        </label>
      ) : null}
      {items.length ? (
        <ul className="item-list">
          {items.map((item) => {
            const thumb = (item as Lecture).thumb;
            return (
              <li key={item.id} className="item-row">
                <a className="item-main" href={`#/${col}/${item.id}`}>
                  {thumb ? (
                    <img
                      className="item-thumb"
                      src={siteUrl(thumb)}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                      }}
                    />
                  ) : (
                    <span className="item-icon" data-col={col}>
                      <Icon name={def.icon} />
                    </span>
                  )}
                  <span className="grow">
                    <strong>{item.title}</strong>
                    <small>{itemMeta(col, item, data).join(' · ')}</small>
                  </span>
                  <Badges item={item} />
                </a>
                <div className="item-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`#/${col}/${item.id}`)}>
                    <Icon name="pencil" />
                    <span>تعديل</span>
                  </button>
                  {!item.hidden ? (
                    <a className="btn btn-ghost btn-sm" href={publicPath(col, item.id)} target="_blank" rel="noopener" title="عرض في الموقع">
                      <Icon name="external" />
                      <span>عرض</span>
                    </a>
                  ) : null}
                  {col === 'courses' ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`#/lectures/new?course=${item.id}`)} title="إضافة محاضرة لهذا المقرر">
                      <Icon name="plus" />
                      <span>محاضرة</span>
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => onDelete(col, item)} aria-label={`حذف ${item.title}`}>
                    <Icon name="trash" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty">
          <Icon name={def.icon} className="big" />
          <p>{q ? 'لا توجد نتائج مطابقة.' : `لم تتم إضافة أي ${def.singular} بعد.`}</p>
          {!q ? (
            <button type="button" className="btn btn-primary" onClick={() => navigate(`#/${col}/new`)}>
              <Icon name="plus" />
              {def.addLabel}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ================================================================== edit */

function initialValues(fields: FieldDef[], original: Record<string, unknown> | undefined, preset: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    const v = original?.[f.name];
    if (v !== undefined) values[f.name] = f.type === 'repeater' && Array.isArray(v) ? v.map((r) => ({ ...r })) : v;
    else if (preset[f.name] !== undefined) values[f.name] = preset[f.name];
    else if (f.type === 'date' && f.required) values[f.name] = today();
    else if (f.type === 'select') values[f.name] = f.options?.[0]?.value;
    else if (f.type === 'repeater') values[f.name] = [];
  }
  return values;
}

function validate(fields: FieldDef[], model: FormModel): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (!f.required) continue;
    const v = model.values[f.name];
    if (f.type === 'file') {
      const choice = model.files[f.name];
      if (choice === 'remove' || (!choice && !v)) errors[f.name] = 'يُرجى اختيار ملف.';
    } else if (f.type === 'richtext') {
      if (!stripHtml(String(v ?? '')).trim() && !/<img/.test(String(v ?? ''))) errors[f.name] = 'هذه الخانة مطلوبة.';
    } else if (f.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''))) errors[f.name] = 'أدخل تاريخاً صحيحاً.';
    } else if (f.type === 'repeater') {
      continue;
    } else if (!String(v ?? '').trim()) {
      errors[f.name] = 'هذه الخانة مطلوبة.';
    }
  }
  for (const f of fields) {
    if (f.type === 'url' && model.values[f.name] && !/^https?:\/\/\S+$/i.test(String(model.values[f.name]).trim())) {
      errors[f.name] = 'يجب أن يبدأ الرابط بـ https://';
    }
  }
  return errors;
}

export function EditView({
  col,
  id,
  preset,
  data,
  gh,
  navigate,
  onSaved,
  onDelete,
  setDirty,
}: {
  col: CollectionName | 'settings';
  id?: string;
  preset: Record<string, string>;
  data: AdminData;
  gh: GitHub;
  navigate: Navigate;
  onSaved: (col: CollectionName | 'settings', item: Record<string, unknown>, sha: string) => void;
  onDelete: (col: CollectionName, item: AnyItem) => void;
  setDirty: (dirty: boolean) => void;
}) {
  const isSettings = col === 'settings';
  const def = isSettings ? undefined : COLLECTIONS[col];
  const fields = isSettings ? SETTINGS_FIELDS : def!.fields;
  const original = isSettings
    ? (data.site as unknown as Record<string, unknown>)
    : (data.items[col].find((i) => i.id === id) as unknown as Record<string, unknown> | undefined);
  const toast = useToast();
  const [model, setModel] = useState<FormModel>(() => ({
    values: initialValues(fields, original, preset),
    files: {},
    images: {},
    inline: new Map(),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<{ label: string; ratio: number } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  if (!isSettings && id && !original) {
    return (
      <div className="view">
        <div className="empty">
          <p>هذا العنصر غير موجود، ربما حُذف.</p>
          <a className="btn btn-primary" href={`#/${col}`}>
            العودة إلى القائمة
          </a>
        </div>
      </div>
    );
  }

  const update = (patch: Partial<FormModel> & { values?: Record<string, unknown> }) => {
    setDirty(true);
    setModel((m) => {
      const values = { ...m.values, ...(patch.values ?? {}) };
      // Suggest the next lecture number when a course is chosen
      if (col === 'lectures' && patch.values && 'course' in patch.values && !m.values.order && !id) {
        const nums = data.items.lectures.filter((l) => (l as Lecture).course === patch.values!.course).map((l) => (l as Lecture).order ?? 0);
        if (patch.values.course) values.order = Math.max(0, ...nums) + 1;
      }
      return {
        ...m,
        values,
        files: { ...m.files, ...(patch.files ?? {}) },
        images: { ...m.images, ...(patch.images ?? {}) },
      };
    });
    if (patch.values) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch.values!))));
    if (patch.files) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch.files!))));
  };

  const save = async () => {
    const errs = validate(fields, model);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast('يُرجى إكمال الخانات المطلوبة.', 'error');
      requestAnimationFrame(() => document.querySelector('.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    const values = { ...model.values };
    for (const f of fields) if (f.type === 'richtext' && typeof values[f.name] === 'string') values[f.name] = sanitize(values[f.name] as string, { keepClasses: true });
    setSaving({ label: 'تجهيز البيانات', ratio: 0.02 });
    try {
      const { item, changes, message } = await prepareSave({
        col,
        original,
        values,
        files: model.files,
        images: model.images,
        inline: model.inline,
      });
      const sha = await gh.commit(changes, message, (p) => setSaving({ label: p.label, ratio: p.ratio }));
      setDirty(false);
      onSaved(col, item, sha);
      toast(isSettings ? 'تم حفظ الإعدادات.' : 'تم الحفظ. سيظهر التحديث على الموقع خلال دقيقة إلى دقيقتين.');
      // the form is saved: leave without the "unsaved changes" guard
      location.hash = isSettings ? '#/' : `#/${col}`;
    } catch (e) {
      setFailure(describeError(e));
    } finally {
      setSaving(null);
    }
  };

  const title = isSettings ? 'إعدادات الموقع' : original ? `تعديل: ${String(original.title ?? '')}` : def!.addLabel;
  const ctx = {
    collection: col,
    courses: data.items.courses as Course[],
    institutions: data.site.institutions,
    original,
  };

  return (
    <div className="view view-edit">
      <div className="view-head">
        <div>
          <a className="back" href={isSettings ? '#/' : `#/${col}`}>
            <Icon name="arrowRight" />
            {isSettings ? 'الرئيسية' : def!.label}
          </a>
          <h1>{title}</h1>
          {original?.sample ? <p className="muted">هذا عنصر تجريبي؛ بمجرد حفظه بعد التعديل يصبح جزءاً من محتواك.</p> : null}
        </div>
        {!isSettings && original && !original.hidden ? (
          <a className="btn btn-ghost" href={publicPath(col, String(original.id))} target="_blank" rel="noopener">
            <Icon name="external" />
            عرض في الموقع
          </a>
        ) : null}
      </div>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        <div className="form-grid">
          {fields.map((f) => (
            <FormField key={f.name} def={f} model={model} ctx={ctx} update={update} error={errors[f.name]} />
          ))}
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={!!saving}>
            <Icon name="save" />
            {isSettings ? 'حفظ الإعدادات' : 'حفظ ونشر'}
          </button>
          <a className="btn btn-ghost" href={isSettings ? '#/' : `#/${col}`}>
            إلغاء
          </a>
          <span className="grow muted small">يظهر التحديث على الموقع خلال دقيقة إلى دقيقتين بعد الحفظ.</span>
          {!isSettings && original ? (
            <button type="button" className="btn btn-ghost danger" onClick={() => onDelete(col, original as unknown as AnyItem)}>
              <Icon name="trash" />
              حذف
            </button>
          ) : null}
        </div>
      </form>
      {saving ? <ProgressOverlay label={saving.label} ratio={saving.ratio} /> : null}
      {failure ? (
        <Modal
          title="تعذّر الحفظ"
          tone="danger"
          onClose={() => setFailure(null)}
          actions={
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setFailure(null);
                  void save();
                }}
              >
                إعادة المحاولة
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setFailure(null)}>
                إغلاق
              </button>
            </>
          }
        >
          <p>{failure}</p>
          <p className="muted small">لم يُفقد أي شيء: ما زالت البيانات في الصفحة ويمكنك إعادة المحاولة.</p>
        </Modal>
      ) : null}
    </div>
  );
}

/* ================================================================== delete helpers */

export function DeleteDialog({
  target,
  data,
  gh,
  onClose,
  onDeleted,
}: {
  target: { col: CollectionName; item: AnyItem } | 'samples';
  data: AdminData;
  gh: GitHub;
  onClose: () => void;
  onDeleted: (removed: { col: CollectionName; id: string }[], sha: string) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<{ label: string; ratio: number } | null>(null);
  const isSamples = target === 'samples';
  const list = isSamples ? sampleItems(data.items) : [target];
  const blocking =
    !isSamples && target.col === 'courses'
      ? data.items.lectures.filter((l) => (l as Lecture).course === target.item.id && !(isSamples && l.sample))
      : [];

  if (blocking.length) {
    return (
      <Modal
        title="لا يمكن حذف هذا المقرر الآن"
        onClose={onClose}
        actions={
          <button type="button" className="btn btn-primary" onClick={onClose}>
            حسناً
          </button>
        }
      >
        <p>
          يحتوي هذا المقرر على {count(blocking.length, WORDS.document)}. احذفها أولاً أو انقلها إلى مقرر آخر (من صفحة تعديل كل محاضرة)، ثم أعد المحاولة.
        </p>
      </Modal>
    );
  }

  const run = async () => {
    setBusy({ label: 'حذف العناصر', ratio: 0.3 });
    try {
      const changes = list.flatMap(({ col, item }) => itemChangesForDelete(col, item));
      const message = isSamples ? 'حذف المحتوى التجريبي' : `حذف ${COLLECTIONS[target.col].singular}: ${target.item.title}`;
      const sha = await gh.commit(changes, message, (p) => setBusy({ label: p.label, ratio: p.ratio }));
      onDeleted(
        list.map(({ col, item }) => ({ col, id: item.id })),
        sha,
      );
      toast(isSamples ? 'تم حذف المحتوى التجريبي.' : 'تم الحذف.');
    } catch (e) {
      toast(describeError(e), 'error');
      setBusy(null);
    }
  };

  if (busy) return <ProgressOverlay label={busy.label} ratio={busy.ratio} />;
  return (
    <Confirm
      danger
      title={isSamples ? 'حذف المحتوى التجريبي' : 'تأكيد الحذف'}
      text={
        isSamples ? (
          <p>
            سيتم حذف {count(list.length, WORDS.item)} {list.length > 10 ? 'تجريبياً' : 'تجريبية'} مع ملفاتها نهائياً. محتواك الخاص لن يتأثر.
          </p>
        ) : (
          <p>
            هل تريد حذف «{target.item.title}» نهائياً؟ سيُحذف معه الملف المرفق إن وُجد.
          </p>
        )
      }
      confirmLabel="نعم، احذف"
      onConfirm={run}
      onClose={onClose}
    />
  );
}

/* ================================================================== help */

export function HelpView() {
  const steps: { icon: Parameters<typeof Icon>[0]['name']; title: string; body: ReactNode }[] = [
    {
      icon: 'lecture',
      title: 'إضافة محاضرة',
      body: (
        <>
          اضغط «إضافة محاضرة»، اختر الملف (PDF أو Word أو PowerPoint)، ثم اختر المقرر واضغط «حفظ ونشر». يُقترح العنوان تلقائياً من اسم الملف ويمكنك
          تعديله. يستطيع الطلبة قراءة الملفات داخل الموقع مباشرة أو تحميلها.
        </>
      ),
    },
    {
      icon: 'article',
      title: 'كتابة مقال',
      body: <>اكتب المقال مباشرة في المحرر، أو اضغط «استيراد من Word» لتحويل ملف جاهز (مع العناوين والهوامش والجداول والصور) ثم راجعه قبل الحفظ.</>,
    },
    {
      icon: 'announcement',
      title: 'الإعلانات',
      body: <>أضف إعلاناً لموعد أو تذكير. فعّل «تثبيت» ليظهر في أعلى الصفحة الرئيسية، ويمكنك تحديد تاريخ يختفي بعده تلقائياً.</>,
    },
    {
      icon: 'clock',
      title: 'متى يظهر التحديث؟',
      body: <>بعد الحفظ يُنشر التحديث تلقائياً خلال دقيقة إلى دقيقتين. يظهر مؤشر «جارٍ النشر» أعلى الصفحة ثم «تم النشر». إن لم يظهر التغيير، حدّث صفحة الموقع.</>,
    },
    {
      icon: 'eyeOff',
      title: 'المسودات',
      body: <>فعّل خيار «مسودة» لتحضير عنصر دون أن يراه الزوار، ثم ألغِه حين يصبح جاهزاً.</>,
    },
    {
      icon: 'fileText',
      title: 'نصائح للملفات',
      body: (
        <>
          الحد الأقصى لحجم الملف 50 ميغابايت. إذا كان الملف أكبر (خاصة الملفات الممسوحة ضوئياً)، اضغطه أولاً بأحد مواقع ضغط PDF. صيغة PDF تحافظ على
          التنسيق كما هو، أما ملفات Word وPowerPoint فتُعرض كنص يتكيف مع شاشة الهاتف، مع إمكانية عرض الشرائح الأصلية.
        </>
      ),
    },
  ];
  return (
    <div className="view">
      <div className="view-head">
        <h1>
          <Icon name="help" />
          دليل الاستعمال
        </h1>
      </div>
      <div className="help-grid">
        {steps.map((s) => (
          <section key={s.title} className="panel help-card">
            <h2>
              <Icon name={s.icon} />
              {s.title}
            </h2>
            <p>{s.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
