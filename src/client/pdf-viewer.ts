/**
 * In-page PDF reader built on pdf.js (legacy build for older phones).
 * Loaded only on pages that contain a .pdf-reader element.
 */
type PdfJs = typeof import('pdfjs-dist');
type ViewerLib = typeof import('pdfjs-dist/web/pdf_viewer.mjs');

const readers = Array.from(document.querySelectorAll<HTMLElement>('.pdf-reader[data-pdf]'));

if (readers.length) void init();

async function init(): Promise<void> {
  const assets = document.body.dataset.assets ?? '/';
  let pdfjs: PdfJs;
  let viewerLib: ViewerLib;
  try {
    pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJs;
    (globalThis as unknown as { pdfjsLib: PdfJs }).pdfjsLib = pdfjs;
    viewerLib = (await import('pdfjs-dist/legacy/web/pdf_viewer.mjs')) as unknown as ViewerLib;
  } catch (err) {
    console.error(err);
    for (const el of readers) fail(el);
    return;
  }
  pdfjs.GlobalWorkerOptions.workerSrc = `${assets}pdf.worker.min.js`;
  for (const el of readers) void setup(el, pdfjs, viewerLib, assets);
}

function fail(el: HTMLElement, message = 'تعذّر عرض الملف داخل الصفحة.'): void {
  const status = el.querySelector<HTMLElement>('[data-status]');
  if (!status) return;
  status.hidden = false;
  status.replaceChildren();
  const p = document.createElement('p');
  p.textContent = message;
  const a = document.createElement('a');
  a.className = 'btn btn-primary';
  a.href = el.dataset.pdf ?? '#';
  a.download = el.dataset.name ?? '';
  a.textContent = 'تحميل الملف لقراءته على جهازك';
  status.append(p, a);
}

async function setup(el: HTMLElement, pdfjs: PdfJs, lib: ViewerLib, assets: string): Promise<void> {
  const container = el.querySelector<HTMLDivElement>('[data-container]')!;
  const status = el.querySelector<HTMLElement>('[data-status]')!;
  const statusText = el.querySelector<HTMLElement>('[data-status-text]');
  const progress = el.querySelector<HTMLElement>('[data-progress]');
  const pageInput = el.querySelector<HTMLInputElement>('[data-page]')!;
  const pagesEl = el.querySelector<HTMLElement>('[data-pages]')!;
  const scaleEl = el.querySelector<HTMLElement>('[data-scale]')!;
  const findInput = el.querySelector<HTMLInputElement>('[data-find]');
  const findCount = el.querySelector<HTMLElement>('[data-find-count]');
  const btn = (act: string) => el.querySelector<HTMLButtonElement>(`[data-act="${act}"]`);

  const eventBus = new lib.EventBus();
  const linkService = new lib.PDFLinkService({ eventBus, externalLinkTarget: 2 });
  const findController = new lib.PDFFindController({ eventBus, linkService });
  const viewer = new lib.PDFViewer({
    container,
    eventBus,
    linkService,
    findController,
    removePageBorders: true,
    textLayerMode: 1,
    maxCanvasPixels: 2 ** 24,
  });
  linkService.setViewer(viewer);

  let total = 0;
  let fitWidth = true;

  const updatePage = (n: number) => {
    pageInput.value = String(n);
    btn('prev')!.disabled = n <= 1;
    btn('next')!.disabled = n >= total;
  };

  eventBus.on('pagesinit', () => {
    viewer.currentScaleValue = 'page-width';
  });
  eventBus.on('pagechanging', (e: { pageNumber: number }) => updatePage(e.pageNumber));
  eventBus.on('scalechanging', (e: { scale: number; presetValue?: string }) => {
    scaleEl.textContent = `${Math.round(e.scale * 100)}%`;
  });
  eventBus.on('updatefindmatchescount', (e: { matchesCount: { current: number; total: number } }) => {
    if (findCount) findCount.textContent = e.matchesCount.total ? `${e.matchesCount.current}/${e.matchesCount.total}` : '';
  });
  eventBus.on('updatefindcontrolstate', (e: { state: number; matchesCount?: { total: number } }) => {
    if (findCount && e.state === 1) findCount.textContent = 'لا نتائج';
  });

  btn('prev')?.addEventListener('click', () => viewer.previousPage());
  btn('next')?.addEventListener('click', () => viewer.nextPage());
  btn('zoom-in')?.addEventListener('click', () => {
    fitWidth = false;
    viewer.increaseScale();
  });
  btn('zoom-out')?.addEventListener('click', () => {
    fitWidth = false;
    viewer.decreaseScale();
  });
  btn('fit')?.addEventListener('click', () => {
    fitWidth = true;
    viewer.currentScaleValue = 'page-width';
  });
  pageInput.addEventListener('change', () => {
    const n = Math.min(Math.max(1, Number(pageInput.value) || 1), total || 1);
    viewer.currentPageNumber = n;
    updatePage(n);
  });

  const expand = btn('expand');
  const setExpanded = (on: boolean) => {
    el.classList.toggle('is-expanded', on);
    document.body.classList.toggle('reader-open', on);
    expand?.setAttribute('aria-label', on ? 'الخروج من ملء الشاشة' : 'ملء الشاشة');
    expand?.setAttribute('aria-pressed', String(on));
    requestAnimationFrame(() => {
      if (fitWidth) viewer.currentScaleValue = 'page-width';
    });
  };
  expand?.addEventListener('click', () => setExpanded(!el.classList.contains('is-expanded')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.classList.contains('is-expanded')) setExpanded(false);
  });

  if (findInput) {
    let timer = 0;
    const find = (type: string) =>
      eventBus.dispatch('find', {
        source: null,
        type,
        query: findInput.value,
        caseSensitive: false,
        entireWord: false,
        highlightAll: true,
        findPrevious: false,
        matchDiacritics: false,
      });
    findInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => find(''), 250);
    });
    findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        find('again');
      }
    });
  }

  let lastWidth = container.clientWidth;
  new ResizeObserver(() => {
    if (Math.abs(container.clientWidth - lastWidth) < 8) return;
    lastWidth = container.clientWidth;
    if (fitWidth && total) viewer.currentScaleValue = 'page-width';
  }).observe(container);

  const task = pdfjs.getDocument({
    url: el.dataset.pdf!,
    cMapUrl: `${assets}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`,
    iccUrl: `${assets}iccs/`,
  });
  task.onProgress = ({ loaded, total: size }: { loaded: number; total: number }) => {
    if (progress && size) progress.style.width = `${Math.min(100, Math.round((loaded / size) * 100))}%`;
  };
  try {
    const pdf = await task.promise;
    total = pdf.numPages;
    pagesEl.textContent = String(total);
    pageInput.max = String(total);
    viewer.setDocument(pdf);
    linkService.setDocument(pdf, null);
    updatePage(1);
    status.hidden = true;
    if (statusText) statusText.textContent = '';
  } catch (err) {
    console.error(err);
    fail(el, (err as Error)?.name === 'PasswordException' ? 'هذا الملف محمي بكلمة مرور.' : undefined);
  }
}
