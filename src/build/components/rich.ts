import { url } from '../ctx';

/**
 * Prepares rich text written in the admin editor (already sanitised there)
 * for publishing: defence-in-depth cleanup, base-path aware links, external
 * links opening in a new tab.
 */
export function richHtml(html: string): string {
  let out = html
    .replace(/<\s*(script|style|iframe|object|template|noscript)\b[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form|input)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*(javascript|vbscript|data:text):[^"']*\2/gi, '$1="#"');
  out = out.replace(/(\s(?:href|src))="\/(?!\/)([^"]*)"/g, (_m, attr: string, p: string) => `${attr}="${url(p)}"`);
  out = out.replace(/<a\s+([^>]*href="(?:https?:)?\/\/[^"]+"[^>]*)>/gi, (m, attrs: string) =>
    /\btarget=/.test(attrs) ? m : `<a ${attrs} target="_blank" rel="noopener">`,
  );
  return out;
}
