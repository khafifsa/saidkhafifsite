/** Browser-side file helpers: PDF page count + thumbnail, image resizing, Word import. */
import DOMPurify from 'dompurify';
import { docxToHtml } from '../lib/docx/convert';
import { inflateRawWeb } from '../lib/docx/zip';
import { pptxSlideCount } from '../lib/pptx/convert';
import { CONFIG } from './config';

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => {
    const lib = m as unknown as PdfJs;
    lib.GlobalWorkerOptions.workerSrc = `${CONFIG.pdfjs}pdf.worker.min.js`;
    return lib;
  });
  return pdfjsPromise;
}

/** Reads the page count and renders a small JPEG of the first page. Never throws. */
export async function inspectPdf(file: File, withThumb: boolean): Promise<{ pages?: number; thumb?: Blob | null }> {
  try {
    const lib = await pdfjs();
    const data = new Uint8Array(await file.arrayBuffer());
    const task = lib.getDocument({
      data,
      cMapUrl: `${CONFIG.pdfjs}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${CONFIG.pdfjs}standard_fonts/`,
      wasmUrl: `${CONFIG.pdfjs}wasm/`,
    });
    const doc = await task.promise;
    const pages = doc.numPages;
    let thumb: Blob | null = null;
    if (withThumb) {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 360 / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, canvas, viewport } as Parameters<typeof page.render>[0]).promise;
      thumb = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    }
    task.destroy().catch(() => {});
    return { pages, thumb };
  } catch (err) {
    console.warn('PDF inspection failed', err);
    return {};
  }
}

/** Number of slides in a PowerPoint file. Never throws. */
export async function inspectPptx(file: File): Promise<{ pages?: number }> {
  try {
    const pages = await pptxSlideCount(new Uint8Array(await file.arrayBuffer()), inflateRawWeb);
    return pages ? { pages } : {};
  } catch {
    return {};
  }
}

/** Downscales photos so the repository stays small. */
export async function resizeImage(file: Blob, maxSize = 1600, quality = 0.85): Promise<Blob> {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 350_000) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  const keepPng = file.type === 'image/png' && file.size < 1_500_000;
  if (!keepPng) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const type = keepPng ? 'image/png' : 'image/jpeg';
  return (await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))) ?? file;
}

const ALLOWED_TAGS = [
  'p', 'br', 'h2', 'h3', 'h4', 'h5', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'a', 'ul', 'ol', 'li',
  'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'hr', 'section', 'div', 'span', 'bdi',
];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'width', 'height', 'colspan', 'rowspan', 'dir', 'class', 'id', 'start', 'value', 'aria-label'];

/** Cleans HTML coming from the editor, from paste, or from Word import. */
const BLOCKS = 'p,div,ul,ol,li,table,blockquote,h2,h3,h4,h5,section,hr';

export function sanitize(html: string, opts: { keepClasses?: boolean } = {}): string {
  const frag = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: opts.keepClasses ? ALLOWED_ATTR : ALLOWED_ATTR.filter((a) => a !== 'class' && a !== 'id'),
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|blob):|\/|#|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    RETURN_DOM_FRAGMENT: true,
  }) as DocumentFragment;
  const rename = (el: Element, tag: string) => {
    const n = document.createElement(tag);
    for (const a of Array.from(el.attributes)) n.setAttribute(a.name, a.value);
    while (el.firstChild) n.appendChild(el.firstChild);
    el.replaceWith(n);
  };
  frag.querySelectorAll('b').forEach((el) => rename(el, 'strong'));
  frag.querySelectorAll('i').forEach((el) => rename(el, 'em'));
  frag.querySelectorAll('span').forEach((el) => {
    if (!el.attributes.length) el.replaceWith(...Array.from(el.childNodes));
  });
  frag.querySelectorAll('div').forEach((el) => {
    if (el.className) return;
    if (el.querySelector(BLOCKS)) el.replaceWith(...Array.from(el.childNodes));
    else rename(el, 'p');
  });
  frag.querySelectorAll('a[href^="http"]').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
  });
  frag.querySelectorAll('p,h2,h3,h4,h5,li,blockquote').forEach((el) => {
    if (!el.textContent?.replace(/\u00a0/g, ' ').trim() && !el.querySelector('img')) el.remove();
  });
  const box = document.createElement('div');
  box.append(frag);
  return box.innerHTML.trim();
}

/** Converts a .docx into editor-ready HTML; embedded images become temporary blob URLs. */
export async function importWord(file: File): Promise<{ html: string; images: Map<string, Blob>; warnings: string[] }> {
  const images = new Map<string, Blob>();
  const result = await docxToHtml(new Uint8Array(await file.arrayBuffer()), {
    inflate: inflateRawWeb,
    imageSrc: async (img) => {
      const blob = await resizeImage(new Blob([img.data as BlobPart], { type: img.contentType }), 1400);
      const url = URL.createObjectURL(blob);
      images.set(url, blob);
      return url;
    },
  });
  const html = result.html.replace(/^<div class="docx-body">([\s\S]*?)<\/div>(<section class="footnotes"|$)/, '$1$2');
  return { html: sanitize(html, { keepClasses: true }), images, warnings: result.warnings };
}

export function fileTitle(name: string): string {
  return name
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s*-\s*/g, ' — ')
    .replace(/\s+/g, ' ')
    .trim();
}
