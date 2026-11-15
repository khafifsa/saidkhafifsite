/**
 * A tiny JSX runtime that renders straight to HTML strings at build time.
 * No virtual DOM, no client framework: pages are plain static HTML.
 */

export class Html {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export type Child = Html | string | number | boolean | null | undefined | Child[];

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

export function render(child: Child): string {
  if (child == null || child === false || child === true) return '';
  if (child instanceof Html) return child.value;
  if (Array.isArray(child)) return child.map(render).join('');
  return esc(String(child));
}

/** Mark a string as trusted HTML (icons, pre-rendered documents). */
export function raw(html: string): Html {
  return new Html(html);
}

export function Fragment(props: { children?: Child }): Html {
  return new Html(render(props.children));
}

type Props = Record<string, unknown> & { children?: Child };

export function jsx(type: string | ((props: any) => Html), props: Props | null): Html {
  if (typeof type === 'function') return type(props ?? {});
  const { children, ...attrs } = props ?? {};
  let out = '<' + type;
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    const name = key === 'className' ? 'class' : key === 'htmlFor' ? 'for' : key;
    out += value === true ? ` ${name}` : ` ${name}="${esc(String(value))}"`;
  }
  out += '>';
  if (VOID.has(type)) return new Html(out);
  return new Html(out + render(children as Child) + `</${type}>`);
}

export const jsxs = jsx;
export const jsxDEV = jsx;

export namespace JSX {
  export type Element = Html;
  export interface IntrinsicElements {
    [name: string]: Record<string, unknown>;
  }
  export interface ElementChildrenAttribute {
    children: {};
  }
}
