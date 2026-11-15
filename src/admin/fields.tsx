/** @jsxImportSource react */
/** Schema-driven form fields for the admin panel. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatSize, pagesLabel } from '../lib/format';
import { FILE_KIND_LABELS, fileKindFromName, type Course, type FieldDef, type FileRef, type Institution } from '../lib/schema';
import { siteUrl } from './config';
import { MAX_FILE_MB, type FileChoice, type ImageChoice } from './data';
import { RichText } from './editor';
import { fileTitle, inspectPdf, inspectPptx, resizeImage } from './files';
import { Icon, useToast } from './ui';

export interface FormModel {
  values: Record<string, unknown>;
  files: Record<string, FileChoice>;
  images: Record<string, ImageChoice>;
  inline: Map<string, Blob>;
}

export interface FieldContext {
  collection: string;
  courses: Course[];
  institutions: Institution[];
  original?: Record<string, unknown>;
}

interface FieldProps {
  def: FieldDef;
  model: FormModel;
  ctx: FieldContext;
  update: (patch: Partial<FormModel> & { values?: Record<string, unknown> }) => void;
  error?: string;
}

export function FormField({ def, model, ctx, update, error }: FieldProps) {
  const id = `f-${def.name}`;
  const value = model.values[def.name];
  const set = (v: unknown) => update({ values: { [def.name]: v } });
  const label = (
    <span className="label">
      {def.label}
      {def.required ? <b className="req" aria-hidden="true"> *</b> : null}
    </span>
  );
  const help = def.help ? <small className="help">{def.help}</small> : null;
  const err = error ? <small className="error" role="alert">{error}</small> : null;
  const cls = `field ${def.half ? 'half' : ''} ${error ? 'has-error' : ''}`;

  switch (def.type) {
    case 'checkbox':
      return (
        <label className={`${cls} check`} htmlFor={id}>
          <input id={id} type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} />
          <span>{def.label}</span>
        </label>
      );
    case 'textarea':
    case 'lines':
      return (
        <label className={cls} htmlFor={id}>
          {label}
          <textarea id={id} rows={def.rows ?? 3} value={String(value ?? '')} placeholder={def.placeholder} onChange={(e) => set(e.target.value)} />
          {help}
          {err}
        </label>
      );
    case 'select':
      return (
        <label className={cls} htmlFor={id}>
          {label}
          <select id={id} value={String(value ?? def.options?.[0]?.value ?? '')} onChange={(e) => set(e.target.value)}>
            {def.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {help}
          {err}
        </label>
      );
    case 'course': {
      const groups = new Map<string, Course[]>();
      for (const c of ctx.courses) groups.set(c.institution ?? '', [...(groups.get(c.institution ?? '') ?? []), c]);
      return (
        <label className={cls} htmlFor={id}>
          {label}
          <select id={id} value={String(value ?? '')} onChange={(e) => set(e.target.value || undefined)}>
            <option value="">— بدون مقرر —</option>
            {[...groups.entries()].map(([inst, list]) => {
              const name = ctx.institutions.find((i) => i.id === inst)?.name;
              const options = list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {c.level ? ` — ${c.level}` : ''}
                </option>
              ));
              return name ? (
                <optgroup key={inst} label={name}>
                  {options}
                </optgroup>
              ) : (
                options
              );
            })}
          </select>
          {!ctx.courses.length ? <small className="help">لا توجد مقررات بعد. أضف مقرراً من قسم «المقررات الدراسية» ليظهر هنا.</small> : help}
          {err}
        </label>
      );
    }
    case 'institution':
      return (
        <label className={cls} htmlFor={id}>
          {label}
          <select id={id} value={String(value ?? '')} onChange={(e) => set(e.target.value || undefined)}>
            <option value="">— اختر المؤسسة —</option>
            {ctx.institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          {!ctx.institutions.length ? <small className="help">أضف المؤسسات من صفحة «الإعدادات».</small> : help}
          {err}
        </label>
      );
    case 'richtext':
      return (
        <div className={cls}>
          <label htmlFor={id}>{label}</label>
          {help}
          <RichText
            id={id}
            value={String(value ?? '')}
            inline={model.inline}
            wordImport={def.wordImport}
            small={!def.wordImport}
            onChange={(html) => set(html)}
            onWordImported={(fileName, heading) => {
              if (!model.values.title) update({ values: { title: heading || fileTitle(fileName) } });
            }}
          />
          {err}
        </div>
      );
    case 'file':
      return <FileField def={def} model={model} ctx={ctx} update={update} error={error} />;
    case 'image':
      return <ImageField def={def} model={model} ctx={ctx} update={update} error={error} />;
    case 'repeater':
      return <Repeater def={def} model={model} ctx={ctx} update={update} error={error} />;
    default: {
      const type = def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : def.type === 'url' ? 'url' : def.type === 'email' ? 'email' : 'text';
      return (
        <label className={cls} htmlFor={id}>
          {label}
          <input
            id={id}
            type={type}
            dir={type === 'url' || type === 'email' ? 'ltr' : undefined}
            inputMode={type === 'number' ? 'numeric' : undefined}
            value={value == null ? '' : String(value)}
            placeholder={def.placeholder ?? (type === 'url' ? 'https://' : undefined)}
            onChange={(e) => set(e.target.value)}
          />
          {def.type === 'tags' && !def.help ? <small className="help">افصل بين الكلمات بفاصلة «،».</small> : help}
          {err}
        </label>
      );
    }
  }
}

/* ------------------------------------------------------------------ file */

function FileField({ def, model, ctx, update, error }: FieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const toast = useToast();
  const choice = model.files[def.name];
  const current = model.values[def.name] as FileRef | undefined;

  const choose = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast(`حجم الملف (${formatSize(file.size)}) يتجاوز الحد المسموح به (${MAX_FILE_MB} ميغابايت). حاول ضغطه ثم أعد المحاولة.`, 'error');
      return;
    }
    const kind = fileKindFromName(file.name);
    setBusy(true);
    const meta: { pages?: number; thumb?: Blob | null } =
      kind === 'pdf' ? await inspectPdf(file, ctx.collection === 'lectures' && def.name === 'file') : kind === 'pptx' ? await inspectPptx(file) : {};
    setBusy(false);
    const patch: Record<string, unknown> = {};
    if (def.name === 'file' && !model.values.title) patch.title = fileTitle(file.name);
    update({ files: { [def.name]: { file, pages: meta.pages, thumb: meta.thumb } }, values: patch });
  };

  const shown =
    choice && choice !== 'remove'
      ? { name: choice.file.name, size: choice.file.size, type: fileKindFromName(choice.file.name), pages: choice.pages, isNew: true }
      : choice === 'remove'
        ? null
        : current
          ? { ...current, isNew: false }
          : null;

  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <span className="label">
        {def.label}
        {def.required ? <b className="req" aria-hidden="true"> *</b> : null}
      </span>
      {shown ? (
        <div className="file-card" data-kind={shown.type}>
          <span className="file-icon">
            <Icon name={shown.type === 'pdf' ? 'fileText' : shown.type === 'docx' || shown.type === 'doc' ? 'fileWord' : shown.type === 'pptx' || shown.type === 'ppt' ? 'slides' : 'file'} />
          </span>
          <div className="grow">
            <strong>{shown.name}</strong>
            <small>
              {[FILE_KIND_LABELS[shown.type], pagesLabel(shown.pages, shown.type), formatSize(shown.size)].filter(Boolean).join(' · ')}
              {shown.isNew ? ' · سيُرفع عند الحفظ' : ''}
            </small>
          </div>
          {!shown.isNew && current ? (
            <a className="btn btn-ghost btn-sm" href={siteUrl(current.path)} target="_blank" rel="noopener">
              <Icon name="eye" />
              فتح
            </a>
          ) : null}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()}>
            <Icon name="refresh" />
            استبدال
          </button>
          {!def.required ? (
            <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => update({ files: { [def.name]: current ? 'remove' : undefined } })}>
              <Icon name="trash" />
              إزالة
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className={`dropzone ${drag ? 'drag' : ''}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void choose(e.dataTransfer.files[0]);
          }}
          disabled={busy}
        >
          <Icon name={busy ? 'loader' : 'upload'} className={busy ? 'spin big' : 'big'} />
          <strong>{busy ? 'جارٍ تحليل الملف…' : 'اضغط لاختيار ملف، أو اسحبه وأفلته هنا'}</strong>
          <small>PDF وWord وPowerPoint تُقرأ داخل الموقع · الحد الأقصى {MAX_FILE_MB} ميغابايت</small>
        </button>
      )}
      {def.help ? <small className="help">{def.help}</small> : null}
      {error ? <small className="error" role="alert">{error}</small> : null}
      <input
        ref={input}
        type="file"
        accept={def.accept}
        hidden
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ image */

function ImageField({ def, model, update, error }: FieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const choice = model.images[def.name];
  const current = model.values[def.name] as string | undefined;
  const preview = useMemo(() => (choice && choice !== 'remove' ? URL.createObjectURL(choice) : undefined), [choice]);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);
  const src = preview ?? (choice !== 'remove' && current ? siteUrl(current) : undefined);
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <span className="label">{def.label}</span>
      <div className="image-field">
        <div className="image-preview">
          {src ? (
            <img
              src={src}
              alt=""
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).replaceWith(document.createTextNode('سيظهر بعد النشر'));
              }}
            />
          ) : (
            <Icon name="image" className="big" />
          )}
        </div>
        <div className="image-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()}>
            <Icon name="upload" />
            {src ? 'تغيير الصورة' : 'اختيار صورة'}
          </button>
          {src ? (
            <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => update({ images: { [def.name]: current ? 'remove' : undefined } })}>
              <Icon name="trash" />
              إزالة
            </button>
          ) : null}
          <small className="help">JPG أو PNG — تُصغَّر الصورة تلقائياً قبل الرفع.</small>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          update({ images: { [def.name]: await resizeImage(f, def.name === 'portrait' ? 1000 : 1600) } });
        }}
      />
      {def.help ? <small className="help">{def.help}</small> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ repeater */

function Repeater({ def, model, update }: FieldProps) {
  const rows = (Array.isArray(model.values[def.name]) ? model.values[def.name] : []) as Record<string, string>[];
  const setRows = (next: Record<string, string>[]) => update({ values: { [def.name]: next } });
  return (
    <div className="field repeater">
      <span className="label">{def.label}</span>
      {def.help ? <small className="help">{def.help}</small> : null}
      {rows.map((row, i) => (
        <div className="repeater-row" key={row.id ?? i}>
          {def.fields!.map((f) => (
            <label key={f.name} className="field">
              <span className="label">{f.label}</span>
              <input
                type={f.type === 'url' ? 'url' : 'text'}
                dir={f.type === 'url' ? 'ltr' : undefined}
                value={row[f.name] ?? ''}
                onChange={(e) => setRows(rows.map((r, k) => (k === i ? { ...r, [f.name]: e.target.value } : r)))}
              />
            </label>
          ))}
          <button type="button" className="btn btn-ghost btn-sm danger" aria-label="حذف السطر" onClick={() => setRows(rows.filter((_, k) => k !== i))}>
            <Icon name="trash" />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows([...rows, {}])}>
        <Icon name="plus" />
        إضافة سطر
      </button>
    </div>
  );
}
