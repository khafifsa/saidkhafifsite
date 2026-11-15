import { count, WORDS } from './arabic';

/** Moroccan Arabic dates: «9 نونبر 2026» (Latin digits, Moroccan month names). */
const dateFmt = new Intl.DateTimeFormat('ar-MA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('ar-MA', { month: 'long', timeZone: 'UTC' });

function parse(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return null;
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
}

export function formatDate(iso?: string): string {
  const d = iso ? parse(iso) : null;
  return d ? dateFmt.format(d) : '';
}

export function dateParts(iso?: string): { day: string; month: string; year: string } | null {
  const d = iso ? parse(iso) : null;
  if (!d) return null;
  return { day: String(d.getUTCDate()), month: monthFmt.format(d), year: String(d.getUTCFullYear()) };
}

export function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} ميغابايت`;
}

export function pagesLabel(n?: number, type?: string): string {
  if (!n) return '';
  return count(n, type === 'pptx' || type === 'ppt' ? WORDS.slide : WORDS.page);
}

/** Reading time for Arabic prose (~170 words per minute). */
export function readingTime(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 170));
  return count(minutes, WORDS.minute);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h\d|li|blockquote|tr|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function excerpt(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).trim() + '…';
}
