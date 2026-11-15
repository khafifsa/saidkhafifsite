/** @jsxImportSource react */
/** Simple right-to-left rich-text editor with Word import and image upload. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { IconName } from '../lib/icons';
import { CONFIG } from './config';
import { importWord, resizeImage, sanitize } from './files';
import { Confirm, Icon, Modal, useToast } from './ui';

/** Stored HTML uses root-relative image paths ("/images/…"); the editor needs the site base path. */
export function toEditorHtml(html: string): string {
  if (CONFIG.base === '/') return html;
  return html.replace(/(\ssrc=")\/(?!\/)/g, `$1${CONFIG.base}`);
}

export function fromEditorHtml(html: string): string {
  if (CONFIG.base === '/') return html;
  return html.split(`src="${CONFIG.base}images/`).join('src="/images/');
}

interface Props {
  value: string;
  onChange: (html: string) => void;
  inline: Map<string, Blob>;
  wordImport?: boolean;
  onWordImported?: (fileName: string, firstHeading?: string) => void;
  placeholder?: string;
  id?: string;
  small?: boolean;
}

const TOOLS: { cmd: string; arg?: string; icon: IconName; label: string; state?: string }[] = [
  { cmd: 'formatBlock', arg: 'h2', icon: 'h2', label: 'عنوان رئيسي' },
  { cmd: 'formatBlock', arg: 'h3', icon: 'h3', label: 'عنوان فرعي' },
  { cmd: 'bold', icon: 'bold', label: 'خط عريض', state: 'bold' },
  { cmd: 'italic', icon: 'italic', label: 'خط مائل', state: 'italic' },
  { cmd: 'underline', icon: 'underline', label: 'تسطير', state: 'underline' },
  { cmd: 'insertUnorderedList', icon: 'list', label: 'قائمة نقطية', state: 'insertUnorderedList' },
  { cmd: 'insertOrderedList', icon: 'listOrdered', label: 'قائمة مرقمة', state: 'insertOrderedList' },
  { cmd: 'formatBlock', arg: 'blockquote', icon: 'quote', label: 'اقتباس' },
];

export function RichText({ value, onChange, inline, wordImport, onWordImported, placeholder, id, small }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const wordInput = useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = useState(!value);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [pendingWord, setPendingWord] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = toEditorHtml(value || '');
    // value is only read on mount: the editor is uncontrolled afterwards
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onSel = () => {
      const sel = document.getSelection();
      if (!sel || !ref.current || !sel.anchorNode || !ref.current.contains(sel.anchorNode)) return;
      range.current = sel.getRangeAt(0).cloneRange();
      const next: Record<string, boolean> = {};
      for (const t of TOOLS) if (t.state) next[t.state] = document.queryCommandState(t.state);
      setActive(next);
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    setEmpty(!el.textContent?.trim() && !el.querySelector('img'));
    onChange(fromEditorHtml(el.innerHTML));
  };

  const restore = () => {
    const el = ref.current!;
    el.focus();
    const sel = document.getSelection();
    if (range.current && sel) {
      sel.removeAllRanges();
      sel.addRange(range.current);
    }
  };

  const exec = (cmd: string, arg?: string) => {
    restore();
    document.execCommand('defaultParagraphSeparator', false, 'p');
    if (cmd === 'formatBlock' && arg) {
      const current = document.queryCommandValue('formatBlock').toLowerCase();
      document.execCommand('formatBlock', false, current === arg ? '<p>' : `<${arg}>`);
    } else {
      document.execCommand(cmd, false, arg);
    }
    emit();
  };

  const insertHtml = (html: string) => {
    restore();
    document.execCommand('insertHTML', false, html);
    emit();
  };

  const addImage = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const blob = await resizeImage(file, 1400);
    const url = URL.createObjectURL(blob);
    inline.set(url, blob);
    insertHtml(`<img src="${url}" alt="">`);
  };

  const runWordImport = async (file: File) => {
    setImporting(true);
    try {
      const result = await importWord(file);
      for (const [url, blob] of result.images) inline.set(url, blob);
      ref.current!.innerHTML = toEditorHtml(result.html);
      emit();
      const heading = ref.current!.querySelector('h2,h3')?.textContent?.trim();
      onWordImported?.(file.name, heading);
      toast(result.warnings.length ? `تم استيراد الملف مع ملاحظة: ${result.warnings[0]}` : 'تم استيراد ملف Word بنجاح. راجع النص قبل الحفظ.', result.warnings.length ? 'info' : 'ok');
    } catch (e) {
      toast(`تعذّر استيراد الملف: ${(e as Error).message}`, 'error');
    } finally {
      setImporting(false);
    }
  };

  const chooseWord = (file: File | undefined) => {
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) {
      toast('يُرجى اختيار ملف Word بصيغة ‎.docx (الصيغة القديمة ‎.doc غير مدعومة؛ افتحه في Word واحفظه بصيغة docx).', 'error');
      return;
    }
    if (ref.current?.textContent?.trim()) setPendingWord(file);
    else void runWordImport(file);
  };

  const tools: ReactNode = TOOLS.map((t) => (
    <button
      key={t.label}
      type="button"
      className={`tool ${t.state && active[t.state] ? 'on' : ''}`}
      title={t.label}
      aria-label={t.label}
      aria-pressed={t.state ? !!active[t.state] : undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => exec(t.cmd, t.arg)}
    >
      <Icon name={t.icon} />
    </button>
  ));

  return (
    <div className={`rte ${small ? 'rte-small' : ''}`}>
      <div className="rte-toolbar" role="toolbar" aria-label="أدوات التنسيق">
        {tools}
        <span className="tool-sep" />
        <button
          type="button"
          className="tool"
          title="إضافة رابط"
          aria-label="إضافة رابط"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setLinkUrl('https://');
            setLinkOpen(true);
          }}
        >
          <Icon name="link" />
        </button>
        <button type="button" className="tool" title="إدراج صورة" aria-label="إدراج صورة" onMouseDown={(e) => e.preventDefault()} onClick={() => imageInput.current?.click()}>
          <Icon name="image" />
        </button>
        <button type="button" className="tool" title="إزالة التنسيق" aria-label="إزالة التنسيق" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('removeFormat')}>
          <Icon name="eraser" />
        </button>
        <span className="tool-sep" />
        <button type="button" className="tool" title="تراجع" aria-label="تراجع" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('undo')}>
          <Icon name="undo" />
        </button>
        <button type="button" className="tool" title="إعادة" aria-label="إعادة" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('redo')}>
          <Icon name="redo" />
        </button>
        {wordImport ? (
          <button type="button" className="tool tool-word" onClick={() => wordInput.current?.click()} disabled={importing}>
            <Icon name={importing ? 'loader' : 'fileWord'} className={importing ? 'spin' : ''} />
            <span>{importing ? 'جارٍ الاستيراد…' : 'استيراد من Word'}</span>
          </button>
        ) : null}
      </div>
      <div
        ref={ref}
        id={id}
        className="rte-area prose"
        contentEditable
        dir="rtl"
        role="textbox"
        aria-multiline="true"
        data-empty={empty ? '' : undefined}
        data-placeholder={placeholder ?? 'اكتب النص هنا…'}
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'p')}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files);
          if (files.some((f) => f.type.startsWith('image/'))) {
            e.preventDefault();
            files.filter((f) => f.type.startsWith('image/')).forEach((f) => void addImage(f));
            return;
          }
          const html = e.clipboardData.getData('text/html');
          const text = e.clipboardData.getData('text/plain');
          e.preventDefault();
          if (html) document.execCommand('insertHTML', false, sanitize(html));
          else document.execCommand('insertText', false, text);
          emit();
        }}
        onDrop={(e) => {
          const file = e.dataTransfer.files[0];
          if (!file) return;
          e.preventDefault();
          if (/\.docx$/i.test(file.name) && wordImport) chooseWord(file);
          else if (file.type.startsWith('image/')) void addImage(file);
        }}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addImage(f);
          e.target.value = '';
        }}
      />
      <input
        ref={wordInput}
        type="file"
        accept=".docx"
        hidden
        onChange={(e) => {
          chooseWord(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {linkOpen ? (
        <Modal
          title="إضافة رابط"
          onClose={() => setLinkOpen(false)}
          actions={
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setLinkOpen(false);
                  const url = linkUrl.trim();
                  if (!/^(https?:\/\/|mailto:)/i.test(url)) return;
                  restore();
                  const sel = document.getSelection();
                  if (sel && sel.isCollapsed) document.execCommand('insertHTML', false, `<a href="${url.replace(/"/g, '&quot;')}">${url.replace(/</g, '&lt;')}</a>`);
                  else document.execCommand('createLink', false, url);
                  emit();
                }}
              >
                إضافة
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setLinkOpen(false)}>
                إلغاء
              </button>
            </>
          }
        >
          <label className="field">
            <span className="label">عنوان الرابط</span>
            <input type="url" dir="ltr" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} autoFocus />
            <small className="help">حدّد الكلمة في النص قبل الضغط على زر الرابط لتحويلها إلى رابط.</small>
          </label>
        </Modal>
      ) : null}
      {pendingWord ? (
        <Confirm
          title="استيراد ملف Word"
          text="سيُستبدل النص الحالي بمحتوى الملف. هل تريد المتابعة؟"
          confirmLabel="نعم، استبدل النص"
          onClose={() => setPendingWord(null)}
          onConfirm={() => {
            const f = pendingWord;
            setPendingWord(null);
            void runWordImport(f);
          }}
        />
      ) : null}
    </div>
  );
}
