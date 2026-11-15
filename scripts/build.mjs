#!/usr/bin/env node
/**
 * Builds the site into /dist:
 *   1. bundles browser code and CSS with esbuild (hashed file names)
 *   2. copies /public and the pdf.js runtime files
 *   3. bundles + runs the static site generator (src/build/main.tsx)
 *
 * Environment (all optional; set automatically by the GitHub Pages workflow):
 *   SITE_URL      public origin, e.g. https://username.github.io
 *   BASE_PATH     sub-path, e.g. /my-repo   (default "/")
 *   GITHUB_REPOSITORY, GITHUB_REF_NAME, GITHUB_SHA   used by the admin panel
 */
import { build as esbuild } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function normaliseBase(value) {
  let b = (value ?? '/').trim() || '/';
  if (!b.startsWith('/')) b = '/' + b;
  if (!b.endsWith('/')) b += '/';
  return b;
}

const TARGETS = ['es2020', 'chrome100', 'safari15', 'firefox100', 'edge100'];

export async function runBuild(options = {}) {
  const started = Date.now();
  const outDir = path.resolve(root, options.outDir ?? process.env.OUT_DIR ?? 'dist');
  const dev = !!options.dev;
  const pdfjsVersion = JSON.parse(await readFile(require.resolve('pdfjs-dist/package.json'), 'utf8')).version;
  const pdfjsDir = `assets/pdfjs-${pdfjsVersion}/`;

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // 1. browser bundles
  const result = await esbuild({
    absWorkingDir: root,
    entryPoints: {
      site: 'src/client/site.ts',
      reader: 'src/client/pdf-viewer.ts',
      admin: 'src/admin/main.tsx',
      'site-style': 'src/styles/site.css',
      'reader-style': 'src/styles/reader.css',
      'admin-style': 'src/admin/admin.css',
    },
    bundle: true,
    splitting: true,
    format: 'esm',
    outdir: path.join(outDir, 'assets'),
    entryNames: '[name]-[hash]',
    chunkNames: 'chunks/[name]-[hash]',
    assetNames: 'media/[name]-[hash]',
    minify: !dev,
    sourcemap: dev ? 'linked' : false,
    target: TARGETS,
    charset: 'utf8',
    legalComments: 'eof',
    metafile: true,
    jsx: 'automatic',
    jsxImportSource: 'react',
    define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
    loader: { '.svg': 'file', '.gif': 'file', '.png': 'file' },
    logLevel: 'warning',
  });

  const assets = {};
  const logical = {
    'src/client/site.ts': 'site.js',
    'src/client/pdf-viewer.ts': 'reader.js',
    'src/admin/main.tsx': 'admin.js',
    'src/styles/site.css': 'site.css',
    'src/styles/reader.css': 'reader.css',
    'src/admin/admin.css': 'admin.css',
  };
  for (const [file, info] of Object.entries(result.metafile.outputs)) {
    if (!info.entryPoint || !logical[info.entryPoint]) continue;
    assets[logical[info.entryPoint]] = path.relative(outDir, path.resolve(root, file)).split(path.sep).join('/');
  }

  // 2. static files + pdf.js runtime
  if (existsSync(path.join(root, 'public'))) await cp(path.join(root, 'public'), outDir, { recursive: true });
  const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const pdfjsOut = path.join(outDir, pdfjsDir);
  await mkdir(pdfjsOut, { recursive: true });
  await cp(path.join(pdfjsRoot, 'legacy/build/pdf.worker.min.mjs'), path.join(pdfjsOut, 'pdf.worker.min.js'));
  for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
    if (existsSync(path.join(pdfjsRoot, dir))) await cp(path.join(pdfjsRoot, dir), path.join(pdfjsOut, dir), { recursive: true });
  }
  await writeFile(path.join(outDir, '.nojekyll'), '');

  // 3. static site generator
  const ssgFile = path.join(root, '.cache', 'ssg.mjs');
  await esbuild({
    absWorkingDir: root,
    entryPoints: ['src/build/main.tsx'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: ssgFile,
    jsx: 'automatic',
    jsxImportSource: '@site/jsx',
    alias: { '@site/jsx': './src/lib/jsx' },
    packages: 'external',
    charset: 'utf8',
    logLevel: 'warning',
  });
  const ssg = await import(pathToFileURL(ssgFile).href + `?t=${Date.now()}`);
  const config = {
    root,
    outDir,
    base: normaliseBase(options.base ?? process.env.BASE_PATH),
    siteUrl: (options.siteUrl ?? process.env.SITE_URL ?? '').replace(/\/+$/, ''),
    repo: options.repo ?? process.env.GITHUB_REPOSITORY ?? '',
    branch: options.branch ?? process.env.GITHUB_REF_NAME ?? 'main',
    sha: options.sha ?? process.env.GITHUB_SHA ?? '',
    apiUrl: options.apiUrl ?? process.env.GITHUB_API_URL ?? 'https://api.github.com',
    dev,
    assets,
    pdfjsDir,
  };
  const summary = await ssg.build(config);

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`✓ ${summary.pages} صفحة في ${seconds} ث — ${outDir}`);
  if (summary.samples) console.log(`ℹ عدد العناصر التجريبية: ${summary.samples} (يمكن حذفها من لوحة التحكم)`);
  for (const w of summary.warnings) console.warn(`⚠ ${w}`);
  return { ...summary, config };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runBuild().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
