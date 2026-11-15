/**
 * Moroccan geometric ornaments, generated as SVG so they stay crisp at any size.
 * - zellige lattice: Rub el Hizb stars (two interlaced squares) joined by small khatam stars
 * - emblem: an original eight-pointed seal with the scales of justice
 */
import { ICONS } from './icons';

const f = (n: number) => +n.toFixed(2);
const path = (pts: number[][]) => 'M' + pts.map((p) => `${f(p[0]!)} ${f(p[1]!)}`).join('L') + 'Z';
const polygon = (cx: number, cy: number, r: number, n: number, rot = 0) =>
  Array.from({ length: n }, (_, k) => {
    const a = ((k * 360) / n + rot) * (Math.PI / 180);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

/** Path data for one 80×80 tile of the lattice. */
export function zelligeTilePath(size = 80): string {
  const c = size / 2;
  const R = size * 0.325;
  let d = path(polygon(c, c, R, 4, 0)) + path(polygon(c, c, R, 4, 45));
  const rc = R * 0.62;
  d += `M${f(c + rc)} ${c}A${f(rc)} ${f(rc)} 0 1 1 ${f(c - rc)} ${c}A${f(rc)} ${f(rc)} 0 1 1 ${f(c + rc)} ${c}Z`;
  const small = size * 0.15;
  for (const [x, y] of [[0, 0], [size, 0], [0, size], [size, size]] as const) {
    d += path(polygon(x, y, small, 4, 0)) + path(polygon(x, y, small, 4, 45));
  }
  d += `M${f(c + R)} ${c}H${size}M${f(c - R)} ${c}H0M${c} ${f(c + R)}V${size}M${c} ${f(c - R)}V0`;
  return d;
}

/** Black-stroke tile, meant to be used as a CSS mask and tinted with background-color. */
export function zelligeSvg(strokeWidth = 1.2, size = 80): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><path d="${zelligeTilePath(size)}" fill="none" stroke="#000" stroke-width="${strokeWidth}" stroke-linejoin="round"/></svg>`;
}

/** The site emblem (eight-pointed seal + scales of justice). */
export function emblemSvg(opts: { size?: number; id?: string; title?: string } = {}): string {
  const id = opts.id ?? 'em';
  const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : '';
  const star = path(polygon(50, 50, 47, 4, 0)) + path(polygon(50, 50, 47, 4, 45));
  const title = opts.title ? `<title>${opts.title}</title>` : '';
  return `<svg class="emblem" viewBox="0 0 100 100"${size} role="img" aria-hidden="${opts.title ? 'false' : 'true'}">${title}<defs><linearGradient id="${id}-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3c27a"/><stop offset=".55" stop-color="#c0912f"/><stop offset="1" stop-color="#94681c"/></linearGradient></defs><path d="${star}" fill="url(#${id}-g)" stroke="#7d5714" stroke-width="1.2" stroke-linejoin="round"/><circle cx="50" cy="50" r="31.5" fill="#0e4a38" stroke="#f3e2b5" stroke-width="1.6"/><circle cx="50" cy="50" r="27" fill="none" stroke="#c0912f" stroke-width=".8" stroke-dasharray="1.6 2.2"/><g transform="translate(34.4 34.4) scale(1.3)" fill="none" stroke="#f6ecd2" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">${ICONS.scale}</g></svg>`;
}

/** Stand-alone favicon. */
export function faviconSvg(): string {
  return emblemSvg({ id: 'fav' }).replace('<svg class="emblem"', '<svg xmlns="http://www.w3.org/2000/svg"');
}
