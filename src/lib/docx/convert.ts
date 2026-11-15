/**
 * Word (.docx) → clean, reflowable, right-to-left friendly HTML.
 *
 * Supports: headings (any UI language, via built-in style names / outline levels),
 * bold/italic/underline (incl. Arabic complex-script variants), links, nested and
 * numbered lists (incl. Arabic alpha/abjad), tables with merged cells, images,
 * footnotes and endnotes, paragraph direction (w:bidi) and centring.
 * Runs at build time (Node) and in the admin panel (browser).
 */
import { ZipReader, type Inflate } from './zip';
import { child, childrenNamed, elements, find, findAll, parseXml, textContent, type XmlElement, type XmlNode } from './xml';

export interface DocxImage {
  path: string;
  contentType: string;
  data: Uint8Array;
}

export interface DocxOptions {
  inflate: Inflate;
  /** Return the src to use for an embedded image (data URI, object URL, written file…). */
  imageSrc?: (img: DocxImage) => string | Promise<string>;
}

export interface DocxResult {
  html: string;
  text: string;
  warnings: string[];
  images: DocxImage[];
}

interface Rel {
  target: string;
  type: string;
  external: boolean;
}

interface StyleRaw {
  name: string;
  basedOn?: string;
  outline?: number;
  bidi?: boolean;
  jc?: string;
  numId?: string;
  ilvl?: number;
  bold?: boolean;
  italic?: boolean;
}

interface StyleResolved {
  names: string[];
  outline?: number;
  bidi?: boolean;
  jc?: string;
  numId?: string;
  ilvl?: number;
  bold?: boolean;
  italic?: boolean;
}

interface Seg {
  html: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  s?: boolean;
  va?: string;
  link?: string;
}

interface Block {
  html: string;
  text: string;
  list?: { level: number; tag: 'ul' | 'ol'; cls: string; start: number; dir: string };
}

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

function on(el?: XmlElement): boolean {
  if (!el) return false;
  const v = (el.attrs['w:val'] ?? '').toLowerCase();
  return !['0', 'false', 'off', 'none'].includes(v);
}

function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

function safeUrl(url: string): string | undefined {
  const u = url.trim();
  return /^(https?:|mailto:)/i.test(u) ? u : undefined;
}

export async function docxToHtml(bytes: Uint8Array, options: DocxOptions): Promise<DocxResult> {
  const zip = new ZipReader(bytes, options.inflate);
  const c = new Converter(zip, options);
  return c.convert();
}

class Converter {
  private rels = new Map<string, Rel>();
  private styles = new Map<string, StyleRaw>();
  private defaultParaStyle?: string;
  private defaultBidi = false;
  private numbering = new Map<string, Map<number, { fmt: string; start: number }>>();
  private footnotes = new Map<string, XmlElement>();
  private endnotes = new Map<string, XmlElement>();
  private notes: { kind: 'fn' | 'en'; id: string; n: number }[] = [];
  private noteIndex = new Map<string, number>();
  private images = new Map<string, string>();
  private imageList: DocxImage[] = [];
  private counters = new Map<string, number[]>();
  private fields: ('instr' | 'result')[] = [];
  private warnings: string[] = [];
  private docPath = 'word/document.xml';

  constructor(private zip: ZipReader, private options: DocxOptions) {}

  async convert(): Promise<DocxResult> {
    const rootRels = await this.zip.text('_rels/.rels');
    if (rootRels) {
      const rel = findAll(parseXml(rootRels), 'Relationship').find((r) => /\/officeDocument$/.test(r.attrs.Type ?? ''));
      if (rel?.attrs.Target) this.docPath = resolvePath('', rel.attrs.Target);
    }
    const docXml = await this.zip.text(this.docPath);
    if (!docXml) throw new Error('تعذّرت قراءة محتوى ملف Word.');
    const relsPath = this.docPath.replace(/[^/]+$/, (f) => `_rels/${f}.rels`);
    const relsXml = await this.zip.text(relsPath);
    if (relsXml) {
      for (const r of findAll(parseXml(relsXml), 'Relationship')) {
        this.rels.set(r.attrs.Id ?? '', {
          target: r.attrs.Target ?? '',
          type: r.attrs.Type ?? '',
          external: (r.attrs.TargetMode ?? '') === 'External',
        });
      }
    }
    await this.loadStyles();
    await this.loadNumbering();
    await this.loadNotes();

    const doc = parseXml(docXml);
    const body = find(doc, 'w:body');
    const noteRoots = [...this.footnotes.values(), ...this.endnotes.values()];
    await this.prepareImages([body, ...noteRoots]);

    const blocks = this.blocks(elements(body));
    const bodyHtml = this.flush(blocks);
    const textParts = blocks.map((b) => b.text);
    const notesHtml = this.renderNotes(textParts);

    return {
      html: `<div class="docx-body">${bodyHtml}</div>${notesHtml}`,
      text: textParts.filter(Boolean).join('\n'),
      warnings: this.warnings,
      images: this.imageList,
    };
  }

  /* ---------------------------- parts ---------------------------- */

  private async loadStyles(): Promise<void> {
    const xml = await this.zip.text('word/styles.xml');
    if (!xml) return;
    const root = parseXml(xml);
    const pPrDefault = find(find(root, 'w:docDefaults'), 'w:pPrDefault');
    if (pPrDefault) this.defaultBidi = on(find(pPrDefault, 'w:bidi'));
    for (const s of findAll(root, 'w:style')) {
      const id = s.attrs['w:styleId'];
      if (!id) continue;
      const pPr = child(s, 'w:pPr');
      const rPr = child(s, 'w:rPr');
      const numPr = child(pPr, 'w:numPr');
      const outline = child(pPr, 'w:outlineLvl')?.attrs['w:val'];
      const ilvl = child(numPr, 'w:ilvl')?.attrs['w:val'];
      this.styles.set(id, {
        name: (child(s, 'w:name')?.attrs['w:val'] ?? '').toLowerCase(),
        basedOn: child(s, 'w:basedOn')?.attrs['w:val'],
        outline: outline != null ? Number(outline) : undefined,
        bidi: child(pPr, 'w:bidi') ? on(child(pPr, 'w:bidi')) : undefined,
        jc: child(pPr, 'w:jc')?.attrs['w:val'],
        numId: child(numPr, 'w:numId')?.attrs['w:val'],
        ilvl: ilvl != null ? Number(ilvl) : undefined,
        bold: child(rPr, 'w:b') || child(rPr, 'w:bCs') ? on(child(rPr, 'w:b') ?? child(rPr, 'w:bCs')) : undefined,
        italic: child(rPr, 'w:i') || child(rPr, 'w:iCs') ? on(child(rPr, 'w:i') ?? child(rPr, 'w:iCs')) : undefined,
      });
      if (s.attrs['w:type'] === 'paragraph' && on({ name: '', attrs: { 'w:val': s.attrs['w:default'] ?? '0' }, children: [] })) {
        this.defaultParaStyle = id;
      }
    }
  }

  private resolveStyle(id?: string): StyleResolved {
    const out: StyleResolved = { names: [] };
    let cur = id ?? this.defaultParaStyle;
    for (let depth = 0; cur && depth < 10; depth++) {
      const s = this.styles.get(cur);
      if (!s) break;
      out.names.push(s.name);
      out.outline ??= s.outline;
      out.bidi ??= s.bidi;
      out.jc ??= s.jc;
      out.numId ??= s.numId;
      out.ilvl ??= s.ilvl;
      out.bold ??= s.bold;
      out.italic ??= s.italic;
      cur = s.basedOn;
    }
    return out;
  }

  private async loadNumbering(): Promise<void> {
    const xml = await this.zip.text('word/numbering.xml');
    if (!xml) return;
    const root = parseXml(xml);
    const abstract = new Map<string, Map<number, { fmt: string; start: number }>>();
    for (const a of findAll(root, 'w:abstractNum')) {
      const levels = new Map<number, { fmt: string; start: number }>();
      for (const lvl of childrenNamed(a, 'w:lvl')) {
        levels.set(Number(lvl.attrs['w:ilvl'] ?? 0), {
          fmt: child(lvl, 'w:numFmt')?.attrs['w:val'] ?? 'decimal',
          start: Number(child(lvl, 'w:start')?.attrs['w:val'] ?? 1),
        });
      }
      abstract.set(a.attrs['w:abstractNumId'] ?? '', levels);
    }
    for (const num of findAll(root, 'w:num')) {
      const absId = child(num, 'w:abstractNumId')?.attrs['w:val'] ?? '';
      const levels = new Map(abstract.get(absId) ?? []);
      for (const ov of childrenNamed(num, 'w:lvlOverride')) {
        const il = Number(ov.attrs['w:ilvl'] ?? 0);
        const startOverride = child(ov, 'w:startOverride')?.attrs['w:val'];
        const lvl = child(ov, 'w:lvl');
        const base = levels.get(il) ?? { fmt: 'decimal', start: 1 };
        levels.set(il, {
          fmt: child(lvl, 'w:numFmt')?.attrs['w:val'] ?? base.fmt,
          start: startOverride != null ? Number(startOverride) : base.start,
        });
      }
      this.numbering.set(num.attrs['w:numId'] ?? '', levels);
    }
  }

  private async loadNotes(): Promise<void> {
    for (const [file, map, tag] of [
      ['word/footnotes.xml', this.footnotes, 'w:footnote'],
      ['word/endnotes.xml', this.endnotes, 'w:endnote'],
    ] as const) {
      const xml = await this.zip.text(file);
      if (!xml) continue;
      for (const n of findAll(parseXml(xml), tag)) {
        const type = n.attrs['w:type'];
        if (type && type !== 'normal') continue;
        map.set(n.attrs['w:id'] ?? '', n);
      }
    }
  }

  private async prepareImages(roots: (XmlElement | undefined)[]): Promise<void> {
    const ids = new Set<string>();
    for (const r of roots) {
      for (const b of findAll(r, 'a:blip')) {
        const id = b.attrs['r:embed'];
        if (id) ids.add(id);
      }
      for (const v of findAll(r, 'v:imagedata')) {
        const id = v.attrs['r:id'];
        if (id) ids.add(id);
      }
    }
    for (const id of ids) {
      const rel = this.rels.get(id);
      if (!rel || rel.external) continue;
      const path = resolvePath(this.docPath, rel.target);
      const ext = path.split('.').pop()?.toLowerCase() ?? '';
      const contentType = IMAGE_TYPES[ext];
      if (!contentType) {
        this.warnings.push(`صورة بصيغة غير مدعومة في المتصفح (${ext}) لم تُعرض.`);
        continue;
      }
      const data = await this.zip.read(path);
      if (!data) continue;
      const img: DocxImage = { path, contentType, data };
      this.imageList.push(img);
      const src = this.options.imageSrc
        ? await this.options.imageSrc(img)
        : `data:${contentType};base64,${toBase64(data)}`;
      this.images.set(id, src);
    }
  }

  /* ---------------------------- blocks ---------------------------- */

  private blocks(nodes: XmlElement[]): Block[] {
    const out: Block[] = [];
    for (const el of nodes) {
      switch (el.name) {
        case 'w:p': {
          const b = this.paragraph(el);
          if (b) out.push(b);
          break;
        }
        case 'w:tbl': {
          const t = this.table(el);
          if (t) out.push(t);
          break;
        }
        case 'w:sdt':
          out.push(...this.blocks(elements(child(el, 'w:sdtContent'))));
          break;
        case 'w:customXml':
        case 'w:ins':
        case 'w:moveTo':
          out.push(...this.blocks(elements(el)));
          break;
        case 'mc:AlternateContent': {
          const choice = child(el, 'mc:Choice') ?? child(el, 'mc:Fallback');
          out.push(...this.blocks(elements(choice)));
          break;
        }
        default:
          break;
      }
    }
    return out;
  }

  private paragraph(p: XmlElement): Block | null {
    const pPr = child(p, 'w:pPr');
    const styleId = child(pPr, 'w:pStyle')?.attrs['w:val'];
    const st = this.resolveStyle(styleId);
    const segs = this.inlines(p.children.filter((c) => !(typeof c === 'object' && c.name === 'w:pPr')), undefined, st);
    let html = joinSegs(segs).trim();
    const text = segs
      .map((s) => s.html)
      .join('')
      .replace(/<sup class="fn-ref">[\s\S]*?<\/sup>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    const hasMedia = /<img\b/.test(html);
    if (!text && !hasMedia) return null;
    html = html.replace(/^(<br>)+|(<br>)+$/g, '');

    const bidiEl = child(pPr, 'w:bidi');
    const rtl = bidiEl ? on(bidiEl) : st.bidi ?? this.defaultBidi;
    const latinOnly = !/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(text) && /[A-Za-z\u00C0-\u024F]/.test(text);
    const dir = latinOnly ? 'ltr' : rtl ? 'rtl' : 'auto';
    const jc = child(pPr, 'w:jc')?.attrs['w:val'] ?? st.jc;
    const cls = jc === 'center' ? ' class="tc"' : '';

    const numPr = child(pPr, 'w:numPr');
    const numId = child(numPr, 'w:numId')?.attrs['w:val'] ?? st.numId;
    const ilvlRaw = child(numPr, 'w:ilvl')?.attrs['w:val'];
    const level = ilvlRaw != null ? Number(ilvlRaw) : st.ilvl ?? 0;

    const heading = this.headingLevel(pPr, st, styleId);
    if (heading) {
      const tag = `h${Math.min(heading + 1, 5)}`;
      return { html: `<${tag} dir="${dir}"${cls}>${html}</${tag}>`, text };
    }
    if (numId && numId !== '0' && this.numbering.has(numId)) {
      const levels = this.numbering.get(numId)!;
      const def = levels.get(level) ?? { fmt: 'decimal', start: 1 };
      const { tag, cls: listCls } = listStyle(def.fmt);
      const counters = this.counters.get(numId) ?? [];
      counters[level] = (counters[level] ?? def.start - 1) + 1;
      counters.length = level + 1;
      this.counters.set(numId, counters);
      return { html, text, list: { level, tag, cls: listCls, start: counters[level]!, dir } };
    }
    if (st.names.some((n) => n === 'quote' || n === 'intense quote' || n === 'block text')) {
      return { html: `<blockquote dir="${dir}">${html}</blockquote>`, text };
    }
    return { html: `<p dir="${dir}"${cls}>${html}</p>`, text };
  }

  private headingLevel(pPr: XmlElement | undefined, st: StyleResolved, styleId?: string): number {
    const outline = child(pPr, 'w:outlineLvl')?.attrs['w:val'];
    if (outline != null && Number(outline) < 9) return Number(outline) + 1;
    for (const name of st.names) {
      const m = /^heading\s*([1-9])$/.exec(name);
      if (m) return Number(m[1]);
      if (name === 'title') return 1;
      if (name === 'subtitle') return 2;
    }
    if (st.outline != null && st.outline < 9) return st.outline + 1;
    const m = /^(?:heading|titre|titulo|título|überschrift|ueberschrift|kop|rubrik)\s*([1-9])$/i.exec(styleId ?? '');
    return m ? Number(m[1]) : 0;
  }

  private table(tbl: XmlElement): Block | null {
    const tblPr = child(tbl, 'w:tblPr');
    const dir = on(child(tblPr, 'w:bidiVisual')) ? 'rtl' : 'ltr';
    type Cell = { html: string; colspan: number; rowspan: number; col: number; merge?: 'restart' | 'continue' };
    const rows: { header: boolean; cells: Cell[] }[] = [];
    const texts: string[] = [];
    const trs = elements(tbl).flatMap((e) => (e.name === 'w:tr' ? [e] : e.name === 'w:sdt' ? childrenNamed(child(e, 'w:sdtContent'), 'w:tr') : []));
    for (const tr of trs) {
      const trPr = child(tr, 'w:trPr');
      const header = !!child(trPr, 'w:tblHeader') && on(child(trPr, 'w:tblHeader'));
      let col = Number(child(trPr, 'w:gridBefore')?.attrs['w:val'] ?? 0);
      const cells: Cell[] = [];
      const tcs = elements(tr).flatMap((e) => (e.name === 'w:tc' ? [e] : e.name === 'w:sdt' ? childrenNamed(child(e, 'w:sdtContent'), 'w:tc') : []));
      for (const tc of tcs) {
        const tcPr = child(tc, 'w:tcPr');
        const span = Number(child(tcPr, 'w:gridSpan')?.attrs['w:val'] ?? 1) || 1;
        const vm = child(tcPr, 'w:vMerge');
        const merge = vm ? (vm.attrs['w:val'] === 'restart' ? 'restart' : 'continue') : undefined;
        const blocks = this.blocks(elements(tc).filter((e) => e.name !== 'w:tcPr'));
        texts.push(...blocks.map((b) => b.text));
        let html = this.flush(blocks);
        const single = /^<p dir="[^"]*"(?: class="[^"]*")?>([\s\S]*)<\/p>$/.exec(html);
        if (single && !single[1]!.includes('<p ')) html = single[1]!;
        cells.push({ html, colspan: span, rowspan: 1, col, merge });
        col += span;
      }
      rows.push({ header, cells });
    }
    if (!rows.length) return null;
    for (let r = 0; r < rows.length; r++) {
      for (const cell of rows[r]!.cells) {
        if (cell.merge !== 'continue') continue;
        for (let k = r - 1; k >= 0; k--) {
          const above = rows[k]!.cells.find((x) => x.col === cell.col);
          if (!above) break;
          if (above.merge !== 'continue') {
            above.rowspan++;
            break;
          }
        }
      }
    }
    const renderRow = (row: { header: boolean; cells: Cell[] }) => {
      const tag = row.header ? 'th' : 'td';
      return (
        '<tr>' +
        row.cells
          .filter((c) => c.merge !== 'continue')
          .map((c) => {
            const attrs = (c.colspan > 1 ? ` colspan="${c.colspan}"` : '') + (c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : '');
            return `<${tag}${attrs}>${c.html}</${tag}>`;
          })
          .join('') +
        '</tr>'
      );
    };
    let headCount = 0;
    while (headCount < rows.length && rows[headCount]!.header) headCount++;
    const head = headCount ? `<thead>${rows.slice(0, headCount).map(renderRow).join('')}</thead>` : '';
    const bodyRows = rows.slice(headCount).map(renderRow).join('');
    return {
      html: `<div class="table-wrap"><table dir="${dir}">${head}<tbody>${bodyRows}</tbody></table></div>`,
      text: texts.join(' '),
    };
  }

  private flush(blocks: Block[]): string {
    let out = '';
    const stack: { tag: string; cls: string; level: number }[] = [];
    const closeTop = () => {
      const t = stack.pop()!;
      out += `</li></${t.tag}>`;
    };
    for (const b of blocks) {
      if (!b.list) {
        while (stack.length) closeTop();
        out += b.html;
        continue;
      }
      const { level, tag, cls, start, dir } = b.list;
      while (stack.length && stack[stack.length - 1]!.level > level) closeTop();
      let top = stack[stack.length - 1];
      if (top && top.level === level && (top.tag !== tag || top.cls !== cls)) {
        closeTop();
        top = stack[stack.length - 1];
      }
      if (!top || top.level < level) {
        const startAttr = tag === 'ol' && start > 1 ? ` start="${start}"` : '';
        out += `<${tag}${cls ? ` class="${cls}"` : ''}${startAttr}>`;
        stack.push({ tag, cls, level });
      } else {
        out += '</li>';
      }
      out += `<li dir="${dir}">${b.html}`;
    }
    while (stack.length) closeTop();
    return out;
  }

  /* ---------------------------- inlines ---------------------------- */

  private inlines(nodes: XmlNode[], link: string | undefined, st: StyleResolved): Seg[] {
    const segs: Seg[] = [];
    for (const node of nodes) {
      if (typeof node !== 'object') continue;
      switch (node.name) {
        case 'w:r':
          segs.push(...this.textRun(node, link, st));
          break;
        case 'w:hyperlink': {
          const rel = node.attrs['r:id'] ? this.rels.get(node.attrs['r:id']) : undefined;
          const href = rel?.external ? safeUrl(rel.target) : undefined;
          segs.push(...this.inlines(node.children, href ?? link, st));
          break;
        }
        case 'w:fldSimple': {
          const m = /HYPERLINK\s+"([^"]+)"/i.exec(node.attrs['w:instr'] ?? '');
          segs.push(...this.inlines(node.children, (m && safeUrl(m[1]!)) || link, st));
          break;
        }
        case 'w:sdt':
          segs.push(...this.inlines(child(node, 'w:sdtContent')?.children ?? [], link, st));
          break;
        case 'w:ins':
        case 'w:moveTo':
        case 'w:smartTag':
        case 'w:customXml':
        case 'w:sdtContent':
          segs.push(...this.inlines(node.children, link, st));
          break;
        case 'mc:AlternateContent': {
          const choice = child(node, 'mc:Choice') ?? child(node, 'mc:Fallback');
          segs.push(...this.inlines(choice?.children ?? [], link, st));
          break;
        }
        case 'm:oMath':
        case 'm:oMathPara': {
          const t = findAll(node, 'm:t').map(textContent).join('');
          if (t) segs.push({ html: esc(t) });
          break;
        }
        default:
          break;
      }
    }
    return segs;
  }

  private textRun(r: XmlElement, link: string | undefined, st: StyleResolved): Seg[] {
    const rPr = child(r, 'w:rPr');
    const rStyle = this.styles.get(child(rPr, 'w:rStyle')?.attrs['w:val'] ?? '');
    const flag = (a: string, b: string, fallback?: boolean) => {
      const el = child(rPr, a) ?? child(rPr, b);
      return el ? on(el) : !!fallback;
    };
    const u = child(rPr, 'w:u');
    const fmt: Omit<Seg, 'html'> = {
      b: flag('w:b', 'w:bCs', rStyle?.bold ?? (rStyle?.name === 'strong' ? true : st.bold && !st.names.some((n) => /^heading|^title/.test(n)))),
      i: flag('w:i', 'w:iCs', rStyle?.italic ?? (rStyle?.name === 'emphasis' ? true : st.italic)),
      u: !!u && (u.attrs['w:val'] ?? 'single') !== 'none' && !link,
      s: on(child(rPr, 'w:strike')) || on(child(rPr, 'w:dstrike')),
      va: (() => {
        const v = child(rPr, 'w:vertAlign')?.attrs['w:val'];
        return v === 'superscript' ? 'sup' : v === 'subscript' ? 'sub' : undefined;
      })(),
      link,
    };
    const segs: Seg[] = [];
    for (const c of elements(r)) {
      switch (c.name) {
        case 'w:t':
          if (this.fields.includes('instr')) break;
          segs.push({ ...fmt, html: esc(textContent(c)) });
          break;
        case 'w:tab':
        case 'w:ptab':
          segs.push({ ...fmt, html: ' ' });
          break;
        case 'w:br':
        case 'w:cr': {
          const type = c.attrs['w:type'];
          if (type === 'page' || type === 'column') break;
          segs.push({ html: '<br>', link });
          break;
        }
        case 'w:noBreakHyphen':
          segs.push({ ...fmt, html: '‑' });
          break;
        case 'w:sym': {
          const code = parseInt(c.attrs['w:char'] ?? '', 16);
          if (code && code < 0xf000) segs.push({ ...fmt, html: esc(String.fromCharCode(code)) });
          break;
        }
        case 'w:fldChar': {
          const type = c.attrs['w:fldCharType'];
          if (type === 'begin') this.fields.push('instr');
          else if (type === 'separate' && this.fields.length) this.fields[this.fields.length - 1] = 'result';
          else if (type === 'end') this.fields.pop();
          break;
        }
        case 'w:footnoteReference':
        case 'w:endnoteReference': {
          const kind = c.name === 'w:footnoteReference' ? 'fn' : 'en';
          const id = c.attrs['w:id'] ?? '';
          const key = `${kind}:${id}`;
          let n = this.noteIndex.get(key);
          const first = n == null;
          if (n == null) {
            n = this.notes.length + 1;
            this.noteIndex.set(key, n);
            this.notes.push({ kind, id, n });
          }
          const anchorId = first ? ` id="fnref-${n}"` : '';
          segs.push({ html: `<sup class="fn-ref"><a href="#fn-${n}"${anchorId}>${n}</a></sup>` });
          break;
        }
        case 'w:drawing':
        case 'w:pict':
        case 'w:object': {
          const img = this.image(c);
          if (img) segs.push({ html: img, link });
          break;
        }
        case 'mc:AlternateContent': {
          const choice = child(c, 'mc:Choice') ?? child(c, 'mc:Fallback');
          for (const inner of elements(choice)) {
            if (inner.name === 'w:drawing' || inner.name === 'w:pict') {
              const img = this.image(inner);
              if (img) segs.push({ html: img, link });
            }
          }
          break;
        }
        default:
          break;
      }
    }
    return segs;
  }

  private image(el: XmlElement): string {
    const blip = find(el, 'a:blip');
    const id = blip?.attrs['r:embed'] ?? find(el, 'v:imagedata')?.attrs['r:id'];
    const src = id ? this.images.get(id) : undefined;
    if (!src) return '';
    const extent = find(el, 'wp:extent');
    const cx = Number(extent?.attrs.cx ?? 0);
    const cy = Number(extent?.attrs.cy ?? 0);
    const size = cx && cy ? ` width="${Math.round(cx / 9525)}" height="${Math.round(cy / 9525)}"` : '';
    const docPr = find(el, 'wp:docPr');
    const alt = docPr?.attrs.descr || docPr?.attrs.title || '';
    return `<img src="${esc(src)}" alt="${esc(alt)}"${size} loading="lazy" decoding="async">`;
  }

  private renderNotes(textParts: string[]): string {
    if (!this.notes.length) return '';
    let items = '';
    for (let k = 0; k < this.notes.length; k++) {
      const { kind, id, n } = this.notes[k]!;
      const el = (kind === 'fn' ? this.footnotes : this.endnotes).get(id);
      if (!el) continue;
      const blocks = this.blocks(elements(el));
      textParts.push(...blocks.map((b) => b.text));
      let html = this.flush(blocks).trim();
      const back = ` <a class="fn-back" href="#fnref-${n}" aria-label="العودة إلى موضع الإحالة">↩</a>`;
      html = /<\/p>$/.test(html) ? html.replace(/<\/p>$/, `${back}</p>`) : html + back;
      items += `<li id="fn-${n}" value="${n}">${html}</li>`;
    }
    return `<section class="footnotes" aria-label="الهوامش"><h2>الهوامش</h2><ol>${items}</ol></section>`;
  }
}

function listStyle(fmt: string): { tag: 'ul' | 'ol'; cls: string } {
  switch (fmt) {
    case 'bullet':
      return { tag: 'ul', cls: '' };
    case 'none':
      return { tag: 'ul', cls: 'plain' };
    case 'lowerLetter':
      return { tag: 'ol', cls: 'la' };
    case 'upperLetter':
      return { tag: 'ol', cls: 'ua' };
    case 'lowerRoman':
      return { tag: 'ol', cls: 'lr' };
    case 'upperRoman':
      return { tag: 'ol', cls: 'ur' };
    case 'arabicAlpha':
      return { tag: 'ol', cls: 'ar-alpha' };
    case 'arabicAbjad':
      return { tag: 'ol', cls: 'ar-abjad' };
    case 'hindiNumbers':
    case 'hindiCounting':
    case 'arabicFullWidth':
      return { tag: 'ol', cls: 'ar-indic' };
    default:
      return { tag: 'ol', cls: '' };
  }
}

function fmtKey(s: Seg): string {
  return `${s.b ? 1 : 0}${s.i ? 1 : 0}${s.u ? 1 : 0}${s.s ? 1 : 0}${s.va ?? ''}|${s.link ?? ''}`;
}

function joinSegs(segs: Seg[]): string {
  let out = '';
  for (let i = 0; i < segs.length; ) {
    const first = segs[i]!;
    const key = fmtKey(first);
    let html = first.html;
    let j = i + 1;
    while (j < segs.length && fmtKey(segs[j]!) === key) html += segs[j++]!.html;
    if (first.va) html = `<${first.va}>${html}</${first.va}>`;
    if (first.s) html = `<s>${html}</s>`;
    if (first.u) html = `<u>${html}</u>`;
    if (first.i) html = `<em>${html}</em>`;
    if (first.b && html.trim()) html = `<strong>${html}</strong>`;
    if (first.link) html = `<a href="${esc(first.link)}" target="_blank" rel="noopener">${html}</a>`;
    out += html;
    i = j;
  }
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}
