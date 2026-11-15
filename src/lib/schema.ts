/**
 * Content model shared by the static site builder and the admin panel.
 * Every item is one JSON file in /content/<collection>/<id>.json.
 */
import type { IconName } from './icons';

export type CollectionName = 'announcements' | 'courses' | 'lectures' | 'articles' | 'books' | 'publications';

export type FileKind = 'pdf' | 'docx' | 'doc' | 'pptx' | 'ppt' | 'xlsx' | 'xls' | 'odt' | 'other';

export interface FileRef {
  /** Path relative to the site root, e.g. "files/lectures/l-20261020-ab12.pdf" */
  path: string;
  /** Original file name, used as the download name */
  name: string;
  size: number;
  type: FileKind;
  pages?: number;
}

interface BaseItem {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  hidden?: boolean;
  sample?: boolean;
}

export interface Course extends BaseItem {
  institution?: string;
  level?: string;
  year?: string;
  order?: number;
  description?: string;
  syllabus?: string;
  file?: FileRef;
}

export type LectureKind = 'lecture' | 'handout' | 'td' | 'exam' | 'summary' | 'document';

export interface Lecture extends BaseItem {
  course?: string;
  kind?: LectureKind;
  order?: number;
  description?: string;
  file?: FileRef;
  thumb?: string;
}

export interface Article extends BaseItem {
  summary?: string;
  body?: string;
  cover?: string;
  file?: FileRef;
  tags?: string;
}

export interface Book extends BaseItem {
  year?: string;
  publisher?: string;
  edition?: string;
  isbn?: string;
  pages?: string;
  coauthors?: string;
  description?: string;
  cover?: string;
  file?: FileRef;
  link?: string;
}

export type PublicationKind = 'article' | 'conference' | 'chapter' | 'report' | 'thesis' | 'other';

export interface Publication extends BaseItem {
  kind?: PublicationKind;
  year?: string;
  venue?: string;
  issue?: string;
  pages?: string;
  coauthors?: string;
  abstract?: string;
  file?: FileRef;
  link?: string;
}

export interface Announcement extends BaseItem {
  body?: string;
  pinned?: boolean;
  until?: string;
  course?: string;
  file?: FileRef;
  link?: string;
}

export type AnyItem = Course | Lecture | Article | Book | Publication | Announcement;

export interface ItemMap {
  announcements: Announcement;
  courses: Course;
  lectures: Lecture;
  articles: Article;
  books: Book;
  publications: Publication;
}

export interface Institution {
  id: string;
  name: string;
  university?: string;
  short?: string;
}

export interface SiteLink {
  label: string;
  url: string;
}

export interface SiteSettings {
  honorific: string;
  name: string;
  title?: string;
  specialty?: string;
  tagline?: string;
  email?: string;
  phone?: string;
  office?: string;
  officeHours?: string;
  institutions: Institution[];
  bio?: string;
  portrait?: string;
  education?: string;
  positions?: string;
  interests?: string;
  links?: SiteLink[];
  footerNote?: string;
  /** true until the professor saves the settings for the first time */
  placeholder?: boolean;
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export const LECTURE_KINDS: Record<LectureKind, string> = {
  lecture: 'محاضرة',
  handout: 'مطبوع',
  td: 'أعمال توجيهية',
  exam: 'امتحان سابق',
  summary: 'ملخص',
  document: 'وثيقة',
};

export const PUBLICATION_KINDS: Record<PublicationKind, string> = {
  article: 'مقال محكّم',
  conference: 'مداخلة في ندوة',
  chapter: 'فصل في كتاب جماعي',
  report: 'تقرير أو دراسة',
  thesis: 'أطروحة أو رسالة',
  other: 'منشور آخر',
};

export const HONORIFICS = ['الدكتور', 'الدكتورة', 'الأستاذ الدكتور', 'الأستاذة الدكتورة', 'الأستاذ', 'الأستاذة'];

export const FILE_KIND_LABELS: Record<FileKind, string> = {
  pdf: 'PDF',
  docx: 'Word',
  doc: 'Word',
  pptx: 'PowerPoint',
  ppt: 'PowerPoint',
  xlsx: 'Excel',
  xls: 'Excel',
  odt: 'OpenDocument',
  other: 'ملف',
};

export function fileKindFromName(name: string): FileKind {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return (['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'odt'] as const).find((k) => k === ext) ?? 'other';
}

/** Files students can read inside the site. */
export function isReadable(file?: FileRef): boolean {
  return !!file && (file.type === 'pdf' || file.type === 'docx' || file.type === 'pptx');
}

/* ------------------------------------------------------------------ */
/* Feed / type metadata                                                */
/* ------------------------------------------------------------------ */

export type FeedType = 'lecture' | 'article' | 'book' | 'publication' | 'announcement';

export const TYPE_META: Record<FeedType, { label: string; plural: string; icon: IconName; tone: string; section: string }> = {
  lecture: { label: 'محاضرة', plural: 'المحاضرات', icon: 'lecture', tone: 'emerald', section: 'lectures' },
  article: { label: 'مقال', plural: 'المقالات', icon: 'article', tone: 'brass', section: 'articles' },
  book: { label: 'مؤلَّف', plural: 'المؤلفات', icon: 'book', tone: 'wine', section: 'books' },
  publication: { label: 'بحث علمي', plural: 'الأبحاث', icon: 'publication', tone: 'indigo', section: 'publications' },
  announcement: { label: 'إعلان', plural: 'الإعلانات', icon: 'announcement', tone: 'red', section: 'announcements' },
};

/* ------------------------------------------------------------------ */
/* Admin form definitions                                              */
/* ------------------------------------------------------------------ */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'date'
  | 'number'
  | 'select'
  | 'course'
  | 'institution'
  | 'file'
  | 'image'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'lines'
  | 'tags'
  | 'repeater';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  accept?: string;
  half?: boolean;
  rows?: number;
  fields?: FieldDef[];
  /** richtext only: allow importing a Word document */
  wordImport?: boolean;
}

export interface CollectionDef {
  name: CollectionName;
  label: string;
  singular: string;
  addLabel: string;
  icon: IconName;
  idPrefix: string;
  /** public URL segment */
  route: string;
  fields: FieldDef[];
}

const opts = (rec: Record<string, string>) => Object.entries(rec).map(([value, label]) => ({ value, label }));

const DOC_ACCEPT = '.pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.odt';
const hiddenField: FieldDef = {
  name: 'hidden',
  label: 'مسودة — لا تظهر للزوار حتى أُلغي هذا الاختيار',
  type: 'checkbox',
};

export const COLLECTIONS: Record<CollectionName, CollectionDef> = {
  lectures: {
    name: 'lectures',
    label: 'المحاضرات والوثائق',
    singular: 'محاضرة أو وثيقة',
    addLabel: 'إضافة محاضرة',
    icon: 'lecture',
    idPrefix: 'l',
    route: 'lectures',
    fields: [
      { name: 'title', label: 'عنوان المحاضرة أو الوثيقة', type: 'text', required: true, placeholder: 'مثال: المحاضرة الثالثة — مصادر القانون' },
      { name: 'file', label: 'الملف', type: 'file', required: true, accept: DOC_ACCEPT, help: 'ملفات PDF وWord وPowerPoint تُقرأ داخل الموقع مباشرة، وباقي الصيغ تبقى قابلة للتحميل.' },
      { name: 'course', label: 'المقرر', type: 'course', half: true },
      { name: 'kind', label: 'نوع الوثيقة', type: 'select', options: opts(LECTURE_KINDS), half: true },
      { name: 'order', label: 'الرقم الترتيبي داخل المقرر', type: 'number', half: true, help: 'المحاضرة 1 تظهر أولاً، ثم 2، وهكذا.' },
      { name: 'date', label: 'تاريخ النشر', type: 'date', half: true, required: true },
      { name: 'description', label: 'وصف مختصر (اختياري)', type: 'textarea', rows: 3 },
      hiddenField,
    ],
  },
  courses: {
    name: 'courses',
    label: 'المقررات الدراسية',
    singular: 'مقرر',
    addLabel: 'إضافة مقرر',
    icon: 'course',
    idPrefix: 'c',
    route: 'courses',
    fields: [
      { name: 'title', label: 'اسم المقرر', type: 'text', required: true, placeholder: 'مثال: مدخل لدراسة القانون' },
      { name: 'institution', label: 'المؤسسة', type: 'institution', half: true, required: true },
      { name: 'level', label: 'المستوى أو الفصل', type: 'text', half: true, placeholder: 'مثال: الفصل الأول (S1)' },
      { name: 'year', label: 'السنة الجامعية', type: 'text', half: true, placeholder: '2026-2027' },
      { name: 'order', label: 'ترتيب العرض', type: 'number', half: true },
      { name: 'description', label: 'تقديم المقرر', type: 'textarea', rows: 4 },
      { name: 'syllabus', label: 'محاور المقرر', type: 'lines', rows: 6, help: 'اكتب كل محور في سطر مستقل.' },
      { name: 'file', label: 'المطبوع الكامل (اختياري)', type: 'file', accept: DOC_ACCEPT },
      { name: 'date', label: 'تاريخ الإضافة', type: 'date', half: true, required: true },
      hiddenField,
    ],
  },
  articles: {
    name: 'articles',
    label: 'المقالات',
    singular: 'مقال',
    addLabel: 'كتابة مقال',
    icon: 'article',
    idPrefix: 'a',
    route: 'articles',
    fields: [
      { name: 'title', label: 'عنوان المقال', type: 'text', required: true },
      { name: 'summary', label: 'ملخص قصير', type: 'textarea', rows: 3, help: 'يظهر في الصفحة الرئيسية وعند مشاركة الرابط.' },
      { name: 'body', label: 'نص المقال', type: 'richtext', required: true, wordImport: true, help: 'اكتب مباشرة هنا، أو استورد ملف Word جاهزاً بزر «استيراد من Word».' },
      { name: 'cover', label: 'صورة الغلاف (اختيارية)', type: 'image' },
      { name: 'file', label: 'نسخة للتحميل PDF أو Word (اختيارية)', type: 'file', accept: DOC_ACCEPT },
      { name: 'tags', label: 'كلمات مفتاحية', type: 'tags', placeholder: 'مثال: منهجية، قانون مدني', half: true },
      { name: 'date', label: 'تاريخ النشر', type: 'date', half: true, required: true },
      hiddenField,
    ],
  },
  books: {
    name: 'books',
    label: 'المؤلفات',
    singular: 'مؤلَّف',
    addLabel: 'إضافة مؤلَّف',
    icon: 'book',
    idPrefix: 'b',
    route: 'books',
    fields: [
      { name: 'title', label: 'عنوان المؤلَّف', type: 'text', required: true },
      { name: 'year', label: 'سنة النشر', type: 'text', half: true, required: true, placeholder: '2025' },
      { name: 'publisher', label: 'دار النشر', type: 'text', half: true },
      { name: 'edition', label: 'الطبعة', type: 'text', half: true, placeholder: 'الطبعة الأولى' },
      { name: 'isbn', label: 'ردمك (ISBN)', type: 'text', half: true },
      { name: 'pages', label: 'عدد الصفحات', type: 'text', half: true },
      { name: 'coauthors', label: 'بالاشتراك مع (اختياري)', type: 'text', half: true },
      { name: 'description', label: 'تقديم الكتاب', type: 'textarea', rows: 5 },
      { name: 'cover', label: 'صورة الغلاف', type: 'image' },
      { name: 'file', label: 'نسخة رقمية (اختيارية)', type: 'file', accept: DOC_ACCEPT },
      { name: 'link', label: 'رابط الاقتناء أو الاطلاع (اختياري)', type: 'url' },
      { name: 'date', label: 'تاريخ الإضافة إلى الموقع', type: 'date', half: true, required: true },
      hiddenField,
    ],
  },
  publications: {
    name: 'publications',
    label: 'الأبحاث والمنشورات العلمية',
    singular: 'بحث',
    addLabel: 'إضافة بحث',
    icon: 'publication',
    idPrefix: 'p',
    route: 'publications',
    fields: [
      { name: 'title', label: 'عنوان البحث', type: 'text', required: true },
      { name: 'kind', label: 'نوع المنشور', type: 'select', options: opts(PUBLICATION_KINDS), half: true },
      { name: 'year', label: 'سنة النشر', type: 'text', half: true, required: true, placeholder: '2025' },
      { name: 'venue', label: 'المجلة أو الندوة أو الكتاب الجماعي', type: 'text' },
      { name: 'issue', label: 'العدد / المجلد', type: 'text', half: true },
      { name: 'pages', label: 'الصفحات', type: 'text', half: true, placeholder: 'ص 45–78' },
      { name: 'coauthors', label: 'بالاشتراك مع (اختياري)', type: 'text' },
      { name: 'abstract', label: 'ملخص البحث', type: 'textarea', rows: 5 },
      { name: 'file', label: 'ملف البحث (اختياري)', type: 'file', accept: DOC_ACCEPT },
      { name: 'link', label: 'رابط خارجي (اختياري)', type: 'url' },
      { name: 'date', label: 'تاريخ الإضافة إلى الموقع', type: 'date', half: true, required: true },
      hiddenField,
    ],
  },
  announcements: {
    name: 'announcements',
    label: 'الإعلانات',
    singular: 'إعلان',
    addLabel: 'إضافة إعلان',
    icon: 'announcement',
    idPrefix: 'n',
    route: 'announcements',
    fields: [
      { name: 'title', label: 'عنوان الإعلان', type: 'text', required: true, placeholder: 'مثال: تغيير موعد حصة الأعمال التوجيهية' },
      { name: 'body', label: 'نص الإعلان', type: 'richtext' },
      { name: 'pinned', label: 'تثبيت الإعلان في أعلى الصفحة الرئيسية', type: 'checkbox' },
      { name: 'course', label: 'المقرر المعني (اختياري)', type: 'course', half: true },
      { name: 'until', label: 'إخفاؤه من الصفحة الرئيسية بعد (اختياري)', type: 'date', half: true },
      { name: 'file', label: 'مرفق (اختياري)', type: 'file', accept: DOC_ACCEPT },
      { name: 'link', label: 'رابط (اختياري)', type: 'url' },
      { name: 'date', label: 'تاريخ الإعلان', type: 'date', half: true, required: true },
      hiddenField,
    ],
  },
};

export const COLLECTION_ORDER: CollectionName[] = ['lectures', 'courses', 'articles', 'announcements', 'books', 'publications'];

export const SETTINGS_FIELDS: FieldDef[] = [
  { name: 'honorific', label: 'الصفة', type: 'select', options: HONORIFICS.map((h) => ({ value: h, label: h })), half: true },
  { name: 'name', label: 'الاسم الكامل', type: 'text', required: true, half: true },
  { name: 'title', label: 'الإطار / الدرجة العلمية', type: 'text', half: true, placeholder: 'أستاذ التعليم العالي' },
  { name: 'specialty', label: 'التخصص', type: 'text', half: true, placeholder: 'القانون الخاص' },
  { name: 'tagline', label: 'جملة الترحيب في الصفحة الرئيسية', type: 'textarea', rows: 2 },
  { name: 'portrait', label: 'الصورة الشخصية', type: 'image' },
  { name: 'bio', label: 'نبذة تعريفية', type: 'richtext' },
  {
    name: 'institutions',
    label: 'المؤسسات التي تدرّس بها',
    type: 'repeater',
    help: 'تُستعمل لتصنيف المقررات وتظهر في رأس الموقع.',
    fields: [
      { name: 'name', label: 'اسم المؤسسة', type: 'text', required: true },
      { name: 'university', label: 'الجامعة', type: 'text' },
      { name: 'short', label: 'اسم مختصر', type: 'text' },
    ],
  },
  { name: 'email', label: 'البريد الإلكتروني', type: 'email', half: true },
  { name: 'phone', label: 'الهاتف (اختياري)', type: 'text', half: true },
  { name: 'office', label: 'مكان الاستقبال', type: 'text', half: true },
  { name: 'officeHours', label: 'أوقات استقبال الطلبة', type: 'text', half: true },
  { name: 'education', label: 'المسار الدراسي', type: 'lines', rows: 4, help: 'سطر لكل شهادة، مثال: 2008 — دكتوراه في القانون الخاص، جامعة …' },
  { name: 'positions', label: 'المسار المهني والمسؤوليات', type: 'lines', rows: 4, help: 'سطر لكل مهمة أو مسؤولية.' },
  { name: 'interests', label: 'مجالات البحث', type: 'tags', placeholder: 'مثال: قانون الالتزامات، قانون الاستهلاك' },
  {
    name: 'links',
    label: 'روابط علمية',
    type: 'repeater',
    help: 'مثل Google Scholar أو ResearchGate.',
    fields: [
      { name: 'label', label: 'الاسم', type: 'text', required: true },
      { name: 'url', label: 'الرابط', type: 'url', required: true },
    ],
  },
  { name: 'footerNote', label: 'ملاحظة أسفل الموقع (اختيارية)', type: 'text' },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `${prefix}-${today().replace(/-/g, '')}-${rand}`;
}

export function displayName(site: Pick<SiteSettings, 'honorific' | 'name'>): string {
  return [site.honorific, site.name].filter(Boolean).join(' ');
}

/** «لـ» + name, merging with the article: لـ + الدكتور → للدكتور */
export function forName(name: string): string {
  return name.startsWith('ال') ? `لل${name.slice(2)}` : `لـ${name}`;
}

export function splitLines(value?: string): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export function splitTags(value?: string): string[] {
  return (value ?? '')
    .split(/[،,;\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}
