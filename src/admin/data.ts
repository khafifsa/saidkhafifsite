/** Reading and writing site content through the GitHub API. */
import {
  COLLECTIONS,
  COLLECTION_ORDER,
  SETTINGS_FIELDS,
  fileKindFromName,
  newId,
  type AnyItem,
  type CollectionName,
  type FieldDef,
  type FileRef,
  type SiteSettings,
} from '../lib/schema';
import type { Change, GitHub } from './github';

export type Items = Record<CollectionName, AnyItem[]>;

export interface AdminData {
  site: SiteSettings;
  items: Items;
}

export const MAX_FILE_MB = 50;

const DEFAULT_SITE: SiteSettings = { honorific: 'الدكتور', name: '', institutions: [] };

export const contentPath = (col: CollectionName, id: string) => `content/${col}/${id}.json`;
export const repoPath = (sitePath: string) => `public/${sitePath.replace(/^\/+/, '')}`;
export const serialize = (obj: unknown) => JSON.stringify(obj, null, 2) + '\n';

type Entry = { name: string; object: { text: string | null; isTruncated?: boolean } | null };

export async function loadAll(gh: GitHub): Promise<AdminData> {
  const vars: Record<string, string> = { owner: gh.owner, name: gh.name, site: `${gh.branch}:content/site.json` };
  const defs: string[] = [];
  const parts: string[] = [];
  COLLECTION_ORDER.forEach((col, i) => {
    vars[`c${i}`] = `${gh.branch}:content/${col}`;
    defs.push(`$c${i}: String!`);
    parts.push(`c${i}: object(expression: $c${i}) { ... on Tree { entries { name object { ... on Blob { text isTruncated } } } } }`);
  });
  const query = `query($owner: String!, $name: String!, $site: String!, ${defs.join(', ')}) {
    repository(owner: $owner, name: $name) {
      site: object(expression: $site) { ... on Blob { text } }
      ${parts.join('\n      ')}
    }
  }`;
  const res = await gh.graphql<{ repository: Record<string, { text?: string; entries?: Entry[] } | null> | null }>(query, vars);
  const repo = res.data?.repository;
  if (!repo) throw new Error(res.errors?.[0]?.message || 'تعذّرت قراءة محتوى المستودع.');

  let site = DEFAULT_SITE;
  try {
    site = { ...DEFAULT_SITE, ...JSON.parse(repo.site?.text ?? '{}') };
  } catch {
    /* keep defaults */
  }

  const items = {} as Items;
  await Promise.all(
    COLLECTION_ORDER.map(async (col, i) => {
      const entries = repo[`c${i}`]?.entries ?? [];
      const list: AnyItem[] = [];
      for (const e of entries) {
        if (!e.name.endsWith('.json')) continue;
        let text = e.object?.text ?? null;
        if (text == null || e.object?.isTruncated) {
          try {
            text = await gh.raw(`content/${col}/${e.name}`);
          } catch {
            continue;
          }
        }
        try {
          const item = JSON.parse(text) as AnyItem;
          item.id ||= e.name.replace(/\.json$/, '');
          list.push(item);
        } catch {
          /* skip broken files */
        }
      }
      list.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
      items[col] = list;
    }),
  );
  return { site, items };
}

/* ------------------------------------------------------------------ saving */

export interface PendingFile {
  file: File;
  pages?: number;
  thumb?: Blob | null;
}

export type FileChoice = PendingFile | 'remove' | undefined;
export type ImageChoice = Blob | 'remove' | undefined;

export interface SaveInput {
  col: CollectionName | 'settings';
  original?: Record<string, unknown>;
  values: Record<string, unknown>;
  files: Record<string, FileChoice>;
  images: Record<string, ImageChoice>;
  /** images inserted in rich-text fields, keyed by their temporary blob: URL */
  inline: Map<string, Blob>;
}

const rand = () => Math.random().toString(36).slice(2, 7);

function extOf(name: string, fallback = 'bin'): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name);
  return m ? m[1]!.toLowerCase() : fallback;
}

function extFromType(type: string): string {
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  if (type.includes('svg')) return 'svg';
  return 'jpg';
}

const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || v === false || (typeof v === 'number' && Number.isNaN(v)) || (Array.isArray(v) && v.length === 0);
}

function clean<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isEmpty(v)) continue;
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out as T;
}

/** Image paths referenced inside rich text, e.g. "/images/articles/a-1/x.jpg" → "images/articles/a-1/x.jpg" */
export function inlineImagePaths(html: string, prefix: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/src="\/(images\/[^"]+)"/g)) if (m[1]!.startsWith(prefix)) out.push(m[1]!);
  return out;
}

export async function prepareSave(input: SaveInput): Promise<{ item: Record<string, unknown>; changes: Change[]; message: string }> {
  const isSettings = input.col === 'settings';
  const def = isSettings ? undefined : COLLECTIONS[input.col as CollectionName];
  const fields: FieldDef[] = isSettings ? SETTINGS_FIELDS : def!.fields;
  const id = isSettings ? 'site' : ((input.original?.id as string) || newId(def!.idPrefix));
  const folder = isSettings ? 'site' : input.col;
  const item: Record<string, unknown> = { ...(input.original ?? {}), ...input.values };
  if (!isSettings) item.id = id;
  const changes: Change[] = [];
  const remove = (sitePath?: unknown) => {
    if (typeof sitePath === 'string' && sitePath) changes.push({ path: repoPath(sitePath), content: null });
  };

  for (const field of fields) {
    const name = field.name;
    const old = input.original?.[name];
    if (field.type === 'file') {
      const choice = input.files[name];
      if (choice === 'remove') {
        remove((old as FileRef | undefined)?.path);
        delete item[name];
        if (name === 'file' && input.original?.thumb) {
          remove(input.original.thumb);
          delete item.thumb;
        }
      } else if (choice) {
        const ext = extOf(choice.file.name);
        const sitePath = `files/${folder}/${id}${name === 'file' ? '' : `-${name}`}-${rand()}.${ext}`;
        changes.push({ path: repoPath(sitePath), content: await bytesOf(choice.file), label: `رفع الملف «${choice.file.name}»` });
        remove((old as FileRef | undefined)?.path);
        const ref: FileRef = { path: sitePath, name: choice.file.name, size: choice.file.size, type: fileKindFromName(choice.file.name) };
        if (choice.pages) ref.pages = choice.pages;
        item[name] = ref;
        if (name === 'file' && input.col === 'lectures') {
          remove(input.original?.thumb);
          delete item.thumb;
          if (choice.thumb) {
            const thumbPath = `images/thumbs/${id}-${rand()}.jpg`;
            changes.push({ path: repoPath(thumbPath), content: await bytesOf(choice.thumb), label: 'حفظ الصورة المصغّرة' });
            item.thumb = thumbPath;
          }
        }
      }
    } else if (field.type === 'image') {
      const choice = input.images[name];
      if (choice === 'remove') {
        remove(old);
        delete item[name];
      } else if (choice) {
        const sitePath = `images/${folder}/${id}-${name}-${rand()}.${extFromType(choice.type)}`;
        changes.push({ path: repoPath(sitePath), content: await bytesOf(choice), label: 'رفع الصورة' });
        remove(old);
        item[name] = sitePath;
      }
    } else if (field.type === 'richtext') {
      let html = String(item[name] ?? '');
      const prefix = `images/${folder}/${id}/`;
      const replacements: [string, string][] = [];
      for (const m of html.matchAll(/src="(blob:[^"]+)"/g)) {
        const blob = input.inline.get(m[1]!);
        if (!blob) continue;
        const sitePath = `${prefix}${rand()}.${extFromType(blob.type)}`;
        changes.push({ path: repoPath(sitePath), content: await bytesOf(blob), label: 'رفع صور النص' });
        replacements.push([m[1]!, `/${sitePath}`]);
      }
      for (const [from, to] of replacements) html = html.split(from).join(to);
      html = html.replace(/<img[^>]+src="blob:[^"]*"[^>]*>/g, '');
      const kept = new Set(inlineImagePaths(html, prefix));
      for (const p of inlineImagePaths(String(old ?? ''), prefix)) if (!kept.has(p)) remove(p);
      item[name] = html;
    } else if (field.type === 'number') {
      const n = item[name] === '' || item[name] == null ? undefined : Number(item[name]);
      item[name] = Number.isFinite(n) ? n : undefined;
    } else if (field.type === 'repeater') {
      const rows = Array.isArray(item[name]) ? (item[name] as Record<string, unknown>[]) : [];
      item[name] = rows.map((r) => clean({ ...r })).filter((r) => Object.keys(r).some((k) => k !== 'id'));
    }
  }

  if (isSettings) {
    const institutions = (item.institutions as { id?: string; name?: string }[] | undefined) ?? [];
    item.institutions = institutions
      .filter((i) => i.name)
      .map((i) => ({ ...i, id: i.id || `inst-${rand()}` }));
    delete item.placeholder;
  } else {
    delete item.sample;
  }

  const cleaned = clean(item);
  const path = isSettings ? 'content/site.json' : contentPath(input.col as CollectionName, id);
  changes.push({ path, content: serialize(cleaned) });
  const message = isSettings
    ? 'تحديث إعدادات الموقع'
    : `${input.original ? 'تعديل' : 'إضافة'} ${def!.singular}: ${String(cleaned.title ?? '')}`;
  return { item: cleaned, changes, message };
}

/** All repository files that belong to an item (its JSON, uploads, thumbnails, inline images). */
export function itemChangesForDelete(col: CollectionName, item: AnyItem): Change[] {
  const rec = item as unknown as Record<string, unknown>;
  const paths = new Set<string>();
  for (const key of ['file', 'thumb', 'cover']) {
    const v = rec[key];
    if (typeof v === 'string' && v) paths.add(v);
    else if (v && typeof v === 'object' && 'path' in v) paths.add(String((v as FileRef).path));
  }
  for (const key of ['body']) {
    if (typeof rec[key] === 'string') for (const p of inlineImagePaths(rec[key] as string, `images/${col}/${item.id}/`)) paths.add(p);
  }
  return [{ path: contentPath(col, item.id), content: null }, ...[...paths].map((p) => ({ path: repoPath(p), content: null }))];
}

export function sampleItems(items: Items): { col: CollectionName; item: AnyItem }[] {
  const out: { col: CollectionName; item: AnyItem }[] = [];
  for (const col of COLLECTION_ORDER) for (const item of items[col] ?? []) if (item.sample) out.push({ col, item });
  return out;
}
