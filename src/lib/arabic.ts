/** Arabic text helpers: search normalisation and grammatical counts. */

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

/** Normalise Arabic (and Latin) text so that searches ignore hamza forms, diacritics, etc. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(TASHKEEL, '')
    .replace(TATWEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

type Forms = { one: string; two: string; few: string; many: string };

const rules = new Intl.PluralRules('ar');

/** e.g. count(3, LECTURES) → "3 محاضرات" */
export function count(n: number, forms: Forms): string {
  switch (rules.select(n)) {
    case 'one':
      return forms.one;
    case 'two':
      return forms.two;
    case 'few':
      return `${n} ${forms.few}`;
    default:
      return `${n} ${forms.many}`;
  }
}

export const WORDS = {
  lecture: { one: 'محاضرة واحدة', two: 'محاضرتان', few: 'محاضرات', many: 'محاضرة' },
  document: { one: 'وثيقة واحدة', two: 'وثيقتان', few: 'وثائق', many: 'وثيقة' },
  page: { one: 'صفحة واحدة', two: 'صفحتان', few: 'صفحات', many: 'صفحة' },
  slide: { one: 'شريحة واحدة', two: 'شريحتان', few: 'شرائح', many: 'شريحة' },
  minute: { one: 'دقيقة واحدة', two: 'دقيقتان', few: 'دقائق', many: 'دقيقة' },
  item: { one: 'عنصر واحد', two: 'عنصران', few: 'عناصر', many: 'عنصراً' },
  result: { one: 'نتيجة واحدة', two: 'نتيجتان', few: 'نتائج', many: 'نتيجة' },
} satisfies Record<string, Forms>;
