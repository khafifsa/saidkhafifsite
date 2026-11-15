/** A small, forgiving XML parser for OOXML parts. */

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}
export type XmlNode = XmlElement | string;

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function parseXml(src: string): XmlElement {
  const root: XmlElement = { name: '#root', attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      pushText(src.slice(i));
      break;
    }
    if (lt > i) pushText(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      const text = src.slice(lt + 9, end < 0 ? n : end);
      stack[stack.length - 1]!.children.push(text);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src[lt + 1] === '?' || src[lt + 1] === '!') {
      const end = src.indexOf('>', lt + 2);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const gt = findTagEnd(src, lt + 1);
    if (gt < 0) break;
    const raw = src.slice(lt + 1, gt);
    i = gt + 1;
    if (raw[0] === '/') {
      const name = raw.slice(1).trim();
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k]!.name === name) {
          stack.length = k;
          break;
        }
      }
      continue;
    }
    const selfClosing = raw.endsWith('/');
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const sp = body.search(/\s/);
    const name = sp < 0 ? body : body.slice(0, sp);
    const attrs: Record<string, string> = {};
    if (sp >= 0) {
      ATTR.lastIndex = 0;
      const rest = body.slice(sp);
      let m: RegExpExecArray | null;
      while ((m = ATTR.exec(rest))) attrs[m[1]!] = decodeEntities(m[2] ?? m[3] ?? '');
    }
    const el: XmlElement = { name, attrs, children: [] };
    stack[stack.length - 1]!.children.push(el);
    if (!selfClosing) stack.push(el);
  }
  return root;

  function pushText(t: string) {
    if (!t) return;
    stack[stack.length - 1]!.children.push(decodeEntities(t));
  }
}

function findTagEnd(src: string, from: number): number {
  let quote = '';
  for (let k = from; k < src.length; k++) {
    const ch = src[k];
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>') return k;
  }
  return -1;
}

export const isEl = (n: XmlNode | undefined): n is XmlElement => typeof n === 'object' && n !== null;

export function child(el: XmlElement | undefined, name: string): XmlElement | undefined {
  if (!el) return undefined;
  for (const c of el.children) if (isEl(c) && c.name === name) return c;
  return undefined;
}

export function childrenNamed(el: XmlElement | undefined, name: string): XmlElement[] {
  return el ? (el.children.filter((c) => isEl(c) && c.name === name) as XmlElement[]) : [];
}

export function elements(el: XmlElement | undefined): XmlElement[] {
  return el ? (el.children.filter(isEl) as XmlElement[]) : [];
}

export function find(el: XmlElement | undefined, name: string): XmlElement | undefined {
  if (!el) return undefined;
  for (const c of el.children) {
    if (!isEl(c)) continue;
    if (c.name === name) return c;
    const deep = find(c, name);
    if (deep) return deep;
  }
  return undefined;
}

export function findAll(el: XmlElement | undefined, name: string, out: XmlElement[] = []): XmlElement[] {
  if (!el) return out;
  for (const c of el.children) {
    if (!isEl(c)) continue;
    if (c.name === name) out.push(c);
    findAll(c, name, out);
  }
  return out;
}

export function textContent(el: XmlElement | undefined): string {
  if (!el) return '';
  return el.children.map((c) => (isEl(c) ? textContent(c) : c)).join('');
}
