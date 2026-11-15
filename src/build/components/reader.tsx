import { raw, type Html } from '../../lib/jsx/jsx-runtime';
import { FILE_KIND_LABELS, type FileRef } from '../../lib/schema';
import { absUrl, config, url } from '../ctx';
import { getStore } from '../state';
import { fileMeta } from '../feed';
import { DownloadLink, Icon, fileIcon } from './ui';

/**
 * In-site reader:
 *  - PDF → pdf.js viewer
 *  - Word / PowerPoint → reflowable text converted at build time, plus (once the
 *    site is online) a tab with the original layout in Microsoft's free Office viewer
 *  - anything else → download card
 */
export function Reader(props: { file: FileRef; title: string }): Html {
  const { file } = props;
  if (file.type === 'pdf') return <PdfReader file={file} title={props.title} />;
  if (file.type === 'docx' || file.type === 'pptx') return <OfficeReader file={file} title={props.title} />;
  return <DownloadCard file={file} />;
}

function officeViewerUrl(file: FileRef): string {
  if (!config().siteUrl) return '';
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absUrl(file.path))}`;
}

function OfficeReader(props: { file: FileRef; title: string }): Html {
  const { file } = props;
  const doc = getStore().docs.get(file.path);
  const slides = file.type === 'pptx';
  const office = officeViewerUrl(file);
  if (!doc && !office) return <DownloadCard file={file} />;
  return (
    <div class="office-reader" data-kind={file.type}>
      {office && doc ? (
        <div class="reader-tabs" role="tablist" aria-label="طريقة العرض">
          <button type="button" role="tab" class="reader-tab" data-tab="text" aria-selected="true">
            <Icon name={slides ? 'list' : 'fileText'} />
            {slides ? 'نص الشرائح' : 'نص المستند'}
          </button>
          <button type="button" role="tab" class="reader-tab" data-tab="original" aria-selected="false">
            <Icon name={slides ? 'slides' : 'fileWord'} />
            {slides ? 'الشرائح الأصلية' : 'التنسيق الأصلي'}
          </button>
        </div>
      ) : null}
      {doc ? (
        <div class="reader-panel" data-panel="text">
          <p class="doc-note">
            <Icon name="info" />
            {slides
              ? 'نص الشرائح مستخرج من ملف PowerPoint ومرتّب ليسهل قراءته على الهاتف؛ للتصميم الأصلي اختر «الشرائح الأصلية» أو حمّل الملف.'
              : 'نسخة مقروءة من ملف Word تتكيّف مع حجم الشاشة؛ للاطلاع على التنسيق الأصلي حمّل الملف.'}
          </p>
          {slides ? (
            <div class="slides-view" aria-label={props.title}>
              {raw(doc.html)}
            </div>
          ) : (
            <article class="doc-paper" aria-label={props.title}>
              <div class="prose">{raw(doc.html)}</div>
            </article>
          )}
        </div>
      ) : null}
      {office ? (
        <div class="reader-panel" data-panel="original" hidden={!!doc}>
          <div class={`office-frame ${slides ? 'is-slides' : 'is-doc'}`}>
            <iframe
              title={`${props.title} — ${FILE_KIND_LABELS[file.type]}`}
              data-src={office}
              src={doc ? undefined : office}
              loading="lazy"
              allowfullscreen
              referrerpolicy="no-referrer-when-downgrade"
            ></iframe>
          </div>
          <p class="doc-note">
            <Icon name="info" />
            يُعرض الملف بتصميمه الأصلي عبر عارض Microsoft Office على الإنترنت. إن لم يظهر، استعمل زر «تحميل الملف».
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function DownloadCard(props: { file: FileRef }): Html {
  const { file } = props;
  return (
    <div class="download-card" data-tone="emerald">
      <span class="big-icon">
        <Icon name={fileIcon(file)} />
      </span>
      <div class="grow">
        <strong>{file.name}</strong>
        <p class="muted">{fileMeta(file).join(' · ')}</p>
        {!['pdf', 'docx', 'pptx'].includes(file.type) ? (
          <p class="muted">لا يمكن عرض ملفات {FILE_KIND_LABELS[file.type]} بهذه الصيغة داخل الموقع، لكن يمكنك تحميلها وفتحها على جهازك.</p>
        ) : null}
      </div>
      <DownloadLink file={file} class="btn btn-primary" label="تحميل الملف" />
    </div>
  );
}

function PdfReader(props: { file: FileRef; title: string }): Html {
  const src = url(props.file.path);
  return (
    <div class="pdf-reader" data-pdf={src} data-name={props.file.name} data-title={props.title}>
      <div class="pdf-toolbar" role="toolbar" aria-label="أدوات القراءة">
        <button type="button" class="tb-btn" data-act="prev" aria-label="الصفحة السابقة" disabled>
          <Icon name="arrowUp" />
        </button>
        <label class="tb-page">
          <span class="visually-hidden">رقم الصفحة</span>
          <input type="number" min="1" value="1" inputmode="numeric" data-page aria-label="رقم الصفحة" />
          <span>
            من <span data-pages>…</span>
          </span>
        </label>
        <button type="button" class="tb-btn" data-act="next" aria-label="الصفحة التالية" disabled>
          <Icon name="arrowDown" />
        </button>
        <span class="sep hide-sm" aria-hidden="true"></span>
        <button type="button" class="tb-btn" data-act="zoom-out" aria-label="تصغير">
          <Icon name="zoomOut" />
        </button>
        <span class="tb-scale" data-scale>100%</span>
        <button type="button" class="tb-btn" data-act="zoom-in" aria-label="تكبير">
          <Icon name="zoomIn" />
        </button>
        <button type="button" class="tb-btn hide-sm" data-act="fit" aria-label="ملء العرض" title="ملء العرض">
          <Icon name="fitWidth" />
        </button>
        <span class="sep hide-sm" aria-hidden="true"></span>
        <label class="tb-find hide-sm">
          <Icon name="search" />
          <input type="search" placeholder="بحث في الملف" data-find aria-label="بحث داخل الملف" />
          <small data-find-count></small>
        </label>
        <span class="grow"></span>
        <button type="button" class="tb-btn" data-act="expand" aria-label="ملء الشاشة" title="ملء الشاشة">
          <Icon name="expand" />
        </button>
        <a class="tb-btn primary" href={src} download={props.file.name} aria-label="تحميل الملف">
          <Icon name="download" />
          <span class="hide-sm">تحميل</span>
        </a>
      </div>
      <div class="pdf-stage">
        <div class="pdf-container" dir="ltr" tabindex="0" data-container>
          <div class="pdfViewer"></div>
        </div>
        <div class="pdf-status" data-status>
          <Icon name="loader" class="spinner" />
          <p data-status-text>جارٍ تحميل الملف…</p>
          <div class="bar">
            <span data-progress></span>
          </div>
          <noscript>
            <p>
              لعرض الملف داخل الصفحة يلزم تفعيل JavaScript، ويمكنك <a href={src}>فتحه مباشرة</a>.
            </p>
          </noscript>
        </div>
      </div>
    </div>
  );
}
