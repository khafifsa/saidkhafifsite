/**
 * PowerPoint (.pptx) → readable, reflowable HTML ("slide text" view).
 *
 * Slides follow the presentation order; inside a slide, text boxes, SmartArt
 * diagrams, tables and pictures are arranged in reading order (top→bottom,
 * right→left for Arabic slides). Logos repeated on many slides are skipped.
 * Runs at build time (Node) and in the admin panel (browser).
 */
import { ZipReader, type Inflate } from '../docx/zip';
import { child, childrenNamed, elements, find, findAll, parseXml, textContent, type XmlElement } from '../docx/xml';
import { toBase64 } from '../docx/convert';

export interface PptxImage {
  path: string;
  contentType: string;
  data: Uint8Array;
}

export interface PptxOptions {
  inflate: Inflate;
  imageSrc?: (img: PptxImage) => string | Promise<string>;
}

export interface PptxResult {
  html: string;
  text: string;
  slides: number;
  warnings: string[];
}

interface Rel {
  target: string;
  type: string;
  external: boolean;
}

interface Block {
  kind: 'title' | 'body' | 'image' | 'table' | 'diagram';
  x: number;
  y: number;
  html: string;
  text: string;
  rtl: boolean;
}

type Tx = (x: number, y: number, w: number, h: number) => [number, number, number, number];

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
const ARABIC = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

async function readRels(zip: ZipReader, partPath: string): Promise<Map<string, Rel>> {
  const relsPath = partPath.replace(/[^/]+$/, (f) => `_rels/${f}.rels`);
  const xml = await zip.text(relsPath);
  const map = new Map<string, Rel>();
  if (!xml) return map;
  for (const r of findAll(parseXml(xml), 'Relationship')) {
    map.set(r.attrs.Id ?? '', { target: r.attrs.Target ?? '', type: r.attrs.Type ?? '', external: r.attrs.TargetMode === 'External' });
  }
  return map;
}

export async function pptxSlideCount(bytes: Uint8Array, inflate: Inflate): Promise<number> {
  const zip = new ZipReader(bytes, inflate);
  const xml = await zip.text('ppt/presentation.xml');
  return xml ? findAll(find(parseXml(xml), 'p:sldIdLst'), 'p:sldId').length : 0;
}

export async function pptxToHtml(bytes: Uint8Array, options: PptxOptions): Promise<PptxResult> {
  const zip = new ZipReader(bytes, options.inflate);
  const presXml = await zip.text('ppt/presentation.xml');
  if (!presXml) throw new Error('الملف ليس عرض PowerPoint بصيغة pptx.');
  const pres = parseXml(presXml);
  const presRels = await readRels(zip, 'ppt/presentation.xml');
  const size = find(pres, 'p:sldSz');
  const W = Number(size?.attrs.cx ?? 9144000) || 9144000;
  const H = Number(size?.attrs.cy ?? 6858000) || 6858000;
  const warnings: string[] = [];

  const slideIds = findAll(find(pres, 'p:sldIdLst'), 'p:sldId');
  const slides: { path: string; doc: XmlElement; rels: Map<string, Rel> }[] = [];
  const usage = new Map<string, number>();
  for (const sid of slideIds) {
    const rel = presRels.get(sid.attrs['r:id'] ?? '');
    if (!rel) continue;
    const path = resolvePath('ppt/presentation.xml', rel.target);
    const xml = await zip.text(path);
    if (!xml) continue;
    const doc = parseXml(xml);
    const rels = await readRels(zip, path);
    slides.push({ path, doc, rels });
    const seen = new Set<string>();
    for (const blip of findAll(doc, 'a:blip')) {
      const r = rels.get(blip.attrs['r:embed'] ?? '');
      if (r && !r.external) seen.add(resolvePath(path, r.target));
    }
    for (const p of seen) usage.set(p, (usage.get(p) ?? 0) + 1);
  }
  const isDecoration = (p: string) => (usage.get(p) ?? 0) >= Math.max(3, Math.ceil(slides.length * 0.25));

  const imageCache = new Map<string, string | null>();
  const imageSrc = async (path: string): Promise<string | null> => {
    if (imageCache.has(path)) return imageCache.get(path)!;
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    const contentType = IMAGE_TYPES[ext];
    let src: string | null = null;
    if (contentType) {
      const data = await zip.read(path);
      if (data) {
        const img = { path, contentType, data };
        src = options.imageSrc ? await options.imageSrc(img) : `data:${contentType};base64,${toBase64(data)}`;
      }
    }
    imageCache.set(path, src);
    return src;
  };

  /* ------------------------------------------------------------ text bodies */

  function renderText(body: XmlElement | undefined, inline = false): { html: string; text: string; rtl: boolean } {
    if (!body) return { html: '', text: '', rtl: false };
    const paras = childrenNamed(body, 'a:p');
    const runs = paras.flatMap((p) => childrenNamed(p, 'a:r'));
    const allBold = runs.length > 0 && runs.every((r) => child(r, 'a:rPr')?.attrs.b === '1');
    let rtlVotes = 0;
    const items: { html: string; text: string; level: number; list?: 'ul' | 'ol'; dir: string; center: boolean }[] = [];
    for (const p of paras) {
      const pPr = child(p, 'a:pPr');
      let html = '';
      let text = '';
      for (const node of elements(p)) {
        if (node.name === 'a:r' || node.name === 'a:fld') {
          if (node.name === 'a:fld' && /slidenum|datetime/i.test(node.attrs.type ?? '')) continue;
          const t = textContent(child(node, 'a:t'));
          if (!t) continue;
          const rPr = child(node, 'a:rPr');
          let h = esc(t);
          if (rPr?.attrs.u && rPr.attrs.u !== 'none') h = `<u>${h}</u>`;
          if (rPr?.attrs.i === '1') h = `<em>${h}</em>`;
          if (rPr?.attrs.b === '1' && !allBold && t.trim()) h = `<strong>${h}</strong>`;
          html += h;
          text += t;
        } else if (node.name === 'a:br') {
          html += '<br>';
          text += ' ';
        }
      }
      html = html.replace(/<\/strong><strong>/g, '').replace(/<\/em><em>/g, '').trim();
      if (!text.trim()) continue;
      const rtl = pPr?.attrs.rtl === '1' || (!pPr?.attrs.rtl && ARABIC.test(text));
      if (rtl) rtlVotes++;
      const latinOnly = !ARABIC.test(text) && /[A-Za-zÀ-ɏ]/.test(text);
      const list = child(pPr, 'a:buAutoNum') ? 'ol' : child(pPr, 'a:buChar') ? 'ul' : undefined;
      items.push({
        html,
        text: text.trim(),
        level: Number(pPr?.attrs.lvl ?? 0) || 0,
        list: inline ? undefined : list,
        dir: latinOnly ? 'ltr' : rtl ? 'rtl' : 'auto',
        center: pPr?.attrs.algn === 'ctr',
      });
    }
    const text = items.map((i) => i.text).join('\n');
    if (inline) return { html: items.map((i) => i.html).join('<br>'), text, rtl: rtlVotes * 2 >= items.length };
    let html = '';
    for (let k = 0; k < items.length; ) {
      const it = items[k]!;
      if (!it.list) {
        const cls = [it.level ? `lvl-${Math.min(it.level, 4)}` : '', it.center ? 'tc' : ''].filter(Boolean).join(' ');
        html += `<p dir="${it.dir}"${cls ? ` class="${cls}"` : ''}>${it.html}</p>`;
        k++;
        continue;
      }
      const tag = it.list;
      html += `<${tag}>`;
      while (k < items.length && items[k]!.list === tag) {
        const li = items[k]!;
        html += `<li dir="${li.dir}"${li.level ? ` class="lvl-${Math.min(li.level, 4)}"` : ''}>${li.html}</li>`;
        k++;
      }
      html += `</${tag}>`;
    }
    return { html, text, rtl: rtlVotes * 2 >= items.length };
  }

  /* ------------------------------------------------------------ shapes */

  async function diagram(frame: XmlElement, slidePath: string, rels: Map<string, Rel>, pos: number[]): Promise<Block | null> {
    const relIds = find(frame, 'dgm:relIds');
    const rel = rels.get(relIds?.attrs['r:dm'] ?? '');
    if (!rel) return null;
    const dataPath = resolvePath(slidePath, rel.target);
    const xml = await zip.text(dataPath);
    if (!xml) return null;
    const data = parseXml(xml);
    type Node = { html: string; text: string; ord: number; children: Node[]; hasParent: boolean };
    const nodes = new Map<string, Node>();
    let docId = '';
    let rtlVotes = 0;
    for (const pt of findAll(find(data, 'dgm:ptLst'), 'dgm:pt')) {
      const type = pt.attrs.type ?? 'node';
      const id = pt.attrs.modelId ?? '';
      if (type === 'doc') docId = id;
      if (type !== 'node' && type !== 'doc' && type !== 'asst') continue;
      const t = renderText(child(pt, 'dgm:t'), true);
      if (t.rtl && t.text) rtlVotes++;
      nodes.set(id, { html: t.html, text: t.text, ord: 0, children: [], hasParent: false });
    }
    for (const c of findAll(find(data, 'dgm:cxnLst'), 'dgm:cxn')) {
      if ((c.attrs.type ?? 'parOf') !== 'parOf') continue;
      const parent = nodes.get(c.attrs.srcId ?? '');
      const kid = nodes.get(c.attrs.destId ?? '');
      if (!parent || !kid || parent === kid) continue;
      kid.ord = Number(c.attrs.srcOrd ?? 0);
      kid.hasParent = true;
      parent.children.push(kid);
    }
    for (const n of nodes.values()) n.children.sort((a, b) => a.ord - b.ord);
    const roots = docId && nodes.get(docId) ? nodes.get(docId)!.children : [...nodes.values()].filter((n) => !n.hasParent);
    const texts: string[] = [];
    const renderList = (list: Node[], depth: number): string => {
      let out = '';
      for (const n of list) {
        if (depth > 12) break;
        const kids = n.children.length ? renderList(n.children, depth + 1) : '';
        if (!n.text) {
          out += kids.replace(/^<ul class="dgm">|<\/ul>$/g, '');
          continue;
        }
        texts.push(n.text);
        out += `<li>${n.html}${kids}</li>`;
      }
      return out ? `<ul class="dgm">${out}</ul>` : '';
    };
    const html = renderList(roots, 0);
    if (!texts.length) return null;
    return { kind: 'diagram', x: pos[0]!, y: pos[1]!, html, text: texts.join('\n'), rtl: rtlVotes * 2 >= texts.length };
  }

  function table(tbl: XmlElement, pos: number[]): Block | null {
    const texts: string[] = [];
    let rtlVotes = 0;
    let cells = 0;
    let rows = '';
    for (const tr of childrenNamed(tbl, 'a:tr')) {
      let row = '';
      for (const tc of childrenNamed(tr, 'a:tc')) {
        if (tc.attrs.hMerge === '1' || tc.attrs.vMerge === '1') continue;
        const t = renderText(child(tc, 'a:txBody'), true);
        cells++;
        if (t.rtl) rtlVotes++;
        if (t.text) texts.push(t.text);
        const span = (tc.attrs.gridSpan ? ` colspan="${tc.attrs.gridSpan}"` : '') + (tc.attrs.rowSpan ? ` rowspan="${tc.attrs.rowSpan}"` : '');
        row += `<td${span}>${t.html}</td>`;
      }
      rows += `<tr>${row}</tr>`;
    }
    if (!texts.length) return null;
    const rtl = rtlVotes * 2 >= cells;
    const bidi = find(tbl, 'a:tblPr')?.attrs.rtl === '1' || rtl;
    return {
      kind: 'table',
      x: pos[0]!,
      y: pos[1]!,
      html: `<div class="table-wrap"><table dir="${bidi ? 'rtl' : 'ltr'}"><tbody>${rows}</tbody></table></div>`,
      text: texts.join(' '),
      rtl,
    };
  }

  function position(xfrm: XmlElement | undefined, tx: Tx, fallbackY: number): number[] {
    const off = child(xfrm, 'a:off');
    const ext = child(xfrm, 'a:ext');
    if (!off) return [0, fallbackY, W, H * 0.2];
    return tx(Number(off.attrs.x ?? 0), Number(off.attrs.y ?? 0), Number(ext?.attrs.cx ?? 0), Number(ext?.attrs.cy ?? 0));
  }

  async function collect(container: XmlElement, slidePath: string, rels: Map<string, Rel>, tx: Tx, out: Block[]): Promise<void> {
    for (const el of elements(container)) {
      switch (el.name) {
        case 'p:sp': {
          const ph = find(child(el, 'p:nvSpPr'), 'p:ph');
          const type = ph?.attrs.type ?? (ph ? 'body' : '');
          if (['sldNum', 'dt', 'ftr', 'hdr'].includes(type)) break;
          const isTitle = type === 'title' || type === 'ctrTitle';
          const pos = position(find(child(el, 'p:spPr'), 'a:xfrm'), tx, isTitle ? 0 : H * 0.22);
          const t = renderText(child(el, 'p:txBody'));
          if (!t.text.trim()) break;
          out.push({ kind: isTitle ? 'title' : 'body', x: pos[0]!, y: pos[1]!, html: t.html, text: t.text, rtl: t.rtl });
          break;
        }
        case 'p:grpSp': {
          const xfrm = find(child(el, 'p:grpSpPr'), 'a:xfrm');
          const off = child(xfrm, 'a:off');
          const ext = child(xfrm, 'a:ext');
          const chOff = child(xfrm, 'a:chOff');
          const chExt = child(xfrm, 'a:chExt');
          const sx = Number(ext?.attrs.cx ?? 1) / (Number(chExt?.attrs.cx ?? 0) || Number(ext?.attrs.cx ?? 1) || 1);
          const sy = Number(ext?.attrs.cy ?? 1) / (Number(chExt?.attrs.cy ?? 0) || Number(ext?.attrs.cy ?? 1) || 1);
          const ox = Number(off?.attrs.x ?? 0);
          const oy = Number(off?.attrs.y ?? 0);
          const cx0 = Number(chOff?.attrs.x ?? 0);
          const cy0 = Number(chOff?.attrs.y ?? 0);
          const inner: Tx = (x, y, w, h) => tx(ox + (x - cx0) * sx, oy + (y - cy0) * sy, w * sx, h * sy);
          await collect(el, slidePath, rels, inner, out);
          break;
        }
        case 'p:pic': {
          const blip = find(el, 'a:blip');
          const rel = rels.get(blip?.attrs['r:embed'] ?? '');
          if (!rel || rel.external) break;
          const path = resolvePath(slidePath, rel.target);
          const pos = position(find(child(el, 'p:spPr'), 'a:xfrm'), tx, H * 0.5);
          const area = (pos[2]! * pos[3]!) / (W * H);
          if (isDecoration(path) || area < 0.02) break;
          const src = await imageSrc(path);
          if (!src) break;
          const descr = find(el, 'p:cNvPr')?.attrs.descr ?? '';
          const width = pos[2] ? Math.round(pos[2] / 9525) : undefined;
          const height = pos[3] ? Math.round(pos[3] / 9525) : undefined;
          out.push({
            kind: 'image',
            x: pos[0]!,
            y: pos[1]!,
            html: `<img src="${esc(src)}" alt="${esc(descr)}"${width && height ? ` width="${width}" height="${height}"` : ''} loading="lazy" decoding="async">`,
            text: '',
            rtl: true,
          });
          break;
        }
        case 'p:graphicFrame': {
          const pos = position(child(el, 'p:xfrm'), tx, H * 0.3);
          const tbl = find(el, 'a:tbl');
          if (tbl) {
            const b = table(tbl, pos);
            if (b) out.push(b);
            break;
          }
          if (find(el, 'dgm:relIds')) {
            const b = await diagram(el, slidePath, rels, pos);
            if (b) out.push(b);
          }
          break;
        }
        case 'mc:AlternateContent': {
          const choice = child(el, 'mc:Choice') ?? child(el, 'mc:Fallback');
          if (choice) await collect(choice, slidePath, rels, tx, out);
          break;
        }
        default:
          break;
      }
    }
  }

  /* ------------------------------------------------------------ slides */

  const identity: Tx = (x, y, w, h) => [x, y, w, h];
  const sections: string[] = [];
  const toc: string[] = [];
  const allText: string[] = [];
  let number = 0;
  for (const s of slides) {
    number++;
    const root = elements(s.doc)[0];
    if (root?.attrs.show === '0') continue;
    const blocks: Block[] = [];
    try {
      await collect(find(s.doc, 'p:spTree') ?? s.doc, s.path, s.rels, identity, blocks);
    } catch (e) {
      warnings.push(`الشريحة ${number}: ${(e as Error).message}`);
    }
    if (!blocks.length) continue;
    const textBlocks = blocks.filter((b) => b.text);
    const rtl = textBlocks.filter((b) => b.rtl).length * 2 >= textBlocks.length;
    const rowH = H * 0.06;
    const ordered = blocks
      .filter((b) => b.kind !== 'title')
      .sort((a, b) => {
        const ra = Math.round(a.y / rowH);
        const rb = Math.round(b.y / rowH);
        if (ra !== rb) return ra - rb;
        return rtl ? b.x - a.x : a.x - b.x;
      });
    let titleBlock = blocks.find((b) => b.kind === 'title');
    if (!titleBlock && ordered[0] && ordered[0].kind === 'body' && ordered[0].text.length < 90 && !ordered[0].text.includes('\n')) {
      titleBlock = ordered.shift();
    }
    const title = titleBlock?.text.replace(/\s+/g, ' ').trim() ?? '';
    const titleHtml = titleBlock ? titleBlock.html.replace(/^<p[^>]*>|<\/p>$/g, '').replace(/<\/p><p[^>]*>/g, ' — ') : '';
    allText.push(title, ...ordered.map((b) => b.text));
    const body = ordered
      .map((b) => (b.kind === 'image' ? `<figure class="slide-img">${b.html}</figure>` : b.kind === 'body' ? `<div class="slide-box">${b.html}</div>` : b.html))
      .join('');
    if (title) toc.push(`<li><a href="#slide-${number}"><span>${number}</span>${esc(title)}</a></li>`);
    sections.push(
      `<section class="slide" id="slide-${number}" dir="${rtl ? 'rtl' : 'ltr'}" aria-label="الشريحة ${number}">` +
        `<span class="slide-num" aria-hidden="true">${number}</span>` +
        (titleHtml ? `<h3 class="slide-title">${titleHtml}</h3>` : '') +
        `<div class="slide-body">${body}</div></section>`,
    );
  }

  const tocHtml =
    toc.length > 3
      ? `<details class="slide-toc"><summary>فهرس الشرائح (${toc.length})</summary><ol>${toc.join('')}</ol></details>`
      : '';
  return {
    html: `<div class="slides">${tocHtml}${sections.join('')}</div>`,
    text: allText.filter(Boolean).join('\n'),
    slides: slides.length,
    warnings,
  };
}
