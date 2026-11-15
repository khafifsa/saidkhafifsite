# الموقع العلمي — الدكتور سعيد خفيف

An Arabic (RTL) academic website for students of the Faculty of Legal and Political Sciences and ENCG Settat (Hassan I University):
lectures, courses, articles, books and publications — readable in the browser, downloadable, and managed from a simple Arabic admin panel.

- **Students** read PDF, Word **and PowerPoint** lectures directly in the page (works on phones), download them, search everything, and share links on WhatsApp.
- **The professor** (or you) opens `/admin`, picks a file, clicks «حفظ ونشر», and the site updates by itself 1–2 minutes later.
- **Free hosting** on GitHub Pages. No server, no database, no monthly bill.

---

## Go live (about 15 minutes, once)

1. **GitHub account** – create a free account at <https://github.com> (a dedicated one for the site is a good idea).
2. **New repository** – click **New**, name it e.g. `site`, keep it **Public**, create it.
   *(Name it `yourname.github.io` instead if you want the site at the root address.)*
3. **Upload the project** – on the empty repository page choose **uploading an existing file** and drag in everything from this folder.
   Make sure the hidden **`.github`** folder is included (Mac: `Cmd + Shift + .` shows hidden files; Windows: *View → Show → Hidden items*).
   If it got skipped: **Add file → Create new file**, name it `.github/workflows/deploy.yml` and paste the content of that file.
4. **Turn on Pages** – *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
5. **First publish** – *Actions* tab → **Deploy site** → **Run workflow**. After ~2 minutes the site is at
   `https://<username>.github.io/site/` (the address is shown on the *Settings → Pages* screen).
6. **Admin key** – open <https://github.com/settings/personal-access-tokens/new> and create a *fine-grained token*:
   - **Repository access:** *Only select repositories* → your site repository
   - **Permissions → Repository:** **Contents: Read and write**, **Actions: Read-only**
   - **Expiration:** *No expiration* (or one year — then repeat this step yearly)
7. **Log in** – open `https://<username>.github.io/site/admin/` on your dad's laptop or phone, paste the token, keep «تذكّرني» ticked.

That's it. Everything else happens in the admin panel, in Arabic.

> Prefer your own domain (e.g. a `.ma` address)? *Settings → Pages → Custom domain*. The build adapts automatically — nothing to change in the code.

## Daily use (admin panel)

| Task | Where |
|---|---|
| Add a lecture (PDF / Word / PowerPoint) | الرئيسية → «إضافة محاضرة» — the title is filled from the file name, slides/pages are counted automatically |
| Write an article, or import a Word file | «كتابة مقال» → «استيراد من Word» keeps headings, lists, tables, images and footnotes |
| Pin an announcement on the home page | «إضافة إعلان» → «تثبيت الإعلان» (optional end date) |
| New course / semester | «إضافة مقرر» — lectures are grouped under it |
| Name, photo, bio, office hours, institutions | «الإعدادات» |
| Hide something while preparing it | tick «مسودة» |
| Remove the demo items | الرئيسية → «حذف المحتوى التجريبي» (one click) |

After each save a «جارٍ النشر…» badge appears in the admin top bar, then «تم النشر».

## What's included

- Home **dashboard**: profile, counters, pinned announcements, a filterable feed of the latest lectures, articles, books, publications and announcements.
- **Courses** grouped by institution, with syllabus, complete handout, and documents grouped by type (lectures, TD, past exams…).
- **Readers**: pdf.js viewer (zoom, page jump, search, full screen); Word converted to clean reflowable text with footnotes;
  PowerPoint shown slide-by-slide as text with a slide index, plus a «الشرائح الأصلية» tab (Microsoft's free Office viewer, available once the site is online).
- Full-text **search** that ignores hamza/diacritic variants (أ/إ/ا، ة/ه، ى/ي).
- Moroccan academic design: emerald and brass palette, zellige lattice, eight-pointed emblem, Amiri / Noto Naskh / IBM Plex Sans Arabic,
  Moroccan month names (نونبر، غشت…), dark mode, print styles, WhatsApp-ready link previews, sitemap.

The university is named in the affiliation text only; no official logo is used, so the site doesn't pass for the university's own website.
If the faculty allows it, a logo can be added as an image in `public/`.

## How it works

```
content/*.json + public/files/*  ──(npm run build)──▶  dist/  ──▶  GitHub Pages
          ▲                                                 ▲
   admin panel commits via the GitHub API      GitHub Actions rebuilds on every commit
```

- `content/` — one JSON file per item (`courses/`, `lectures/`, `articles/`, `books/`, `publications/`, `announcements/`) and `site.json` (settings).
- `public/` — uploaded files and images, published as-is.
- `src/build/` — static site generator (TypeScript + a tiny JSX-to-HTML runtime, no framework).
- `src/lib/docx/`, `src/lib/pptx/` — Word and PowerPoint → HTML converters (used at build time and in the admin).
- `src/client/` — small browser scripts (menu, search, filters, readers). `src/admin/` — the admin panel (React).
- `src/styles/` — design tokens and stylesheets (change the brand colours in `tokens.css`).

### Local preview

```bash
npm install
npm run dev      # http://localhost:4321  (rebuilds on save)
npm run build    # production build into dist/
```

## Limits & tips

- Files up to **50 MB** each. Scanned PDFs are often bigger: compress them first.
- Old `.doc` / `.ppt` files can be downloaded but not read in the page: re-save them as `.docx` / `.pptx`.
- GitHub Pages allows a ~1 GB site and ~100 GB of traffic per month — years of lectures. The admin home shows the space used.
- Lost a device? Delete the token on GitHub (*Settings → Developer settings → Personal access tokens*) and create a new one.

## Credits

pdf.js (Apache-2.0) · React (MIT) · DOMPurify (Apache-2.0) · esbuild (MIT) · Lucide icons (ISC) ·
Amiri, Noto Naskh Arabic, IBM Plex Sans Arabic via Google Fonts (SIL OFL).
