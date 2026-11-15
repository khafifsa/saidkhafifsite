import { raw, type Child, type Html } from '../../lib/jsx/jsx-runtime';
import { iconSvg, type IconName } from '../../lib/icons';
import { emblemSvg } from '../../lib/ornaments';
import { dateParts, formatDate } from '../../lib/format';
import { FILE_KIND_LABELS, TYPE_META, isReadable, type FeedType, type FileRef } from '../../lib/schema';
import { absUrl, url } from '../ctx';
import { fileMeta } from '../feed';

export function Icon(props: { name: IconName; class?: string }): Html {
  return raw(iconSvg(props.name, props.class ?? 'icon'));
}

/** Small eight-pointed star used as a heading ornament. */
export function Star(props: { class?: string }): Html {
  return raw(
    `<svg class="${props.class ?? 'star'}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1L23 12L12 23L1 12ZM4.22 4.22H19.78V19.78H4.22Z" fill="var(--brass-400)"/><circle cx="12" cy="12" r="3.4" fill="var(--emerald-800)"/></svg>`,
  );
}

export function Emblem(props: { size?: number; id?: string; title?: string }): Html {
  return raw(emblemSvg(props));
}

export function SectionTitle(props: { title: string; id?: string; more?: { href: string; label: string } }): Html {
  return (
    <div class="section-title">
      <Star />
      <h2 id={props.id}>{props.title}</h2>
      {props.more ? (
        <a class="more" href={url(props.more.href)}>
          {props.more.label}
          <Icon name="arrowLeft" />
        </a>
      ) : null}
    </div>
  );
}

export function TypeBadge(props: { type: FeedType; label?: string }): Html {
  const meta = TYPE_META[props.type];
  return (
    <span class="badge" data-tone={meta.tone}>
      <Icon name={meta.icon} />
      {props.label ?? meta.label}
    </span>
  );
}

export function SampleBadge(props: { show?: boolean }): Html | null {
  return props.show ? <span class="badge badge-sample" title="محتوى تجريبي يمكن حذفه من لوحة التحكم">نموذج</span> : null;
}

export interface Crumb {
  href?: string;
  label: string;
}

export function PageHead(props: { title: string; lead?: Child; crumbs?: Crumb[]; meta?: Child; children?: Child }): Html {
  const crumbs: Crumb[] = [{ href: '', label: 'الرئيسية' }, ...(props.crumbs ?? [])];
  return (
    <header class="page-head pattern">
      <div class="container">
        <nav aria-label="مسار التصفح">
          <ol class="crumbs">
            {crumbs.map((c, i) => (
              <li style="display:contents">
                {i > 0 ? <Icon name="chevronLeft" /> : null}
                {c.href != null ? <a href={url(c.href)}>{c.label}</a> : <span aria-current="page">{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
        <h1>{props.title}</h1>
        {props.lead ? <p class="lead">{props.lead}</p> : null}
        {props.meta ? <div class="head-meta">{props.meta}</div> : null}
        {props.children}
      </div>
    </header>
  );
}

export function DateText(props: { iso?: string }): Html | null {
  if (!props.iso) return null;
  return <time datetime={props.iso}>{formatDate(props.iso)}</time>;
}

export function DateBlock(props: { iso: string }): Html {
  const p = dateParts(props.iso);
  return (
    <time class="date-block" datetime={props.iso}>
      <span class="d">{p?.day}</span>
      <span class="m">{p?.month}</span>
      <span class="y">{p?.year}</span>
    </time>
  );
}

export function fileIcon(file?: FileRef): IconName {
  if (!file) return 'file';
  if (file.type === 'pdf') return 'fileText';
  if (file.type === 'docx' || file.type === 'doc' || file.type === 'odt') return 'fileWord';
  if (file.type === 'pptx' || file.type === 'ppt') return 'slides';
  return 'file';
}

export function FileType(props: { file?: FileRef }): Html | null {
  if (!props.file) return null;
  return (
    <span class="filetype">
      <Icon name={fileIcon(props.file)} />
      {FILE_KIND_LABELS[props.file.type]}
    </span>
  );
}

export function DownloadLink(props: { file: FileRef; class?: string; label?: string }): Html {
  return (
    <a class={props.class ?? 'btn btn-ghost btn-sm'} href={url(props.file.path)} download={props.file.name}>
      <Icon name="download" />
      {props.label ?? 'تحميل'}
    </a>
  );
}

export function ReadLink(props: { href: string; file?: FileRef; class?: string; label?: string }): Html | null {
  if (props.file && !isReadable(props.file)) return null;
  return (
    <a class={props.class ?? 'btn btn-primary btn-sm'} href={url(props.href)}>
      <Icon name="eye" />
      {props.label ?? 'قراءة'}
    </a>
  );
}

export function ShareBar(props: { title: string; path: string; compact?: boolean }): Html {
  const link = absUrl(props.path);
  const wa = `https://wa.me/?text=${encodeURIComponent(`${props.title}\n${link}`)}`;
  return (
    <div class="share-bar">
      <button type="button" class="btn btn-ghost btn-sm" data-share data-title={props.title} data-url={link}>
        <Icon name="share" />
        مشاركة
      </button>
      <a class="btn btn-ghost btn-sm" href={wa} target="_blank" rel="noopener" data-wa data-title={props.title}>
        <Icon name="message" />
        واتساب
      </a>
      <button type="button" class="btn btn-ghost btn-sm" data-copy={link}>
        <Icon name="link" />
        نسخ الرابط
      </button>
    </div>
  );
}

/** Keeps values such as «2026-2027» in typed order inside Arabic text. */
export function Ltr(props: { children?: Child }): Html {
  return <bdi dir="ltr">{props.children}</bdi>;
}

export function Empty(props: { text: string; icon?: IconName }): Html {
  return (
    <div class="empty">
      <Icon name={props.icon ?? 'folder'} />
      <p>{props.text}</p>
    </div>
  );
}

export function FileMetaLine(props: { file?: FileRef }): Html | null {
  const parts = fileMeta(props.file);
  if (!parts.length) return null;
  return <span>{parts.join(' · ')}</span>;
}

/** SVG definitions used by the arch-shaped portrait (inserted once per page). */
export function ArchDefs(): Html {
  return raw(
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><clipPath id="arch-clip" clipPathUnits="objectBoundingBox"><path d="M0.06,1 L0.06,0.53 A0.5,0.36 0 1,1 0.94,0.53 L0.94,1 Z"/></clipPath></defs></svg>',
  );
}

export function Portrait(props: { src?: string; name: string }): Html {
  const initial = props.name.replace(/^(ال)/, '').trim().charAt(0) || 'أ';
  return (
    <div class="hero-portrait">
      {props.src ? (
        <img class="arch-photo" src={url(props.src)} alt={props.name} width="620" height="775" />
      ) : (
        <div class="arch-monogram pattern" role="img" aria-label={props.name}>
          <span>{initial}</span>
        </div>
      )}
      {raw(
        '<svg class="arch-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="outer" d="M6,100 L6,53 A50,36 0 1,1 94,53 L94,100"/><path class="inner" d="M10.5,100 L10.5,54 A45.5,32.5 0 1,1 89.5,54 L89.5,100"/></svg>',
      )}
    </div>
  );
}
