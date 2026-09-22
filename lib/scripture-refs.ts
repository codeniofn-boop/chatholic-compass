import { findBook, hebrewPsalmToDouay, type BibleBook } from "./bible-books";

export interface ScriptureRef {
  book: BibleBook;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
  /** Chapter number in the Douay-Rheims (only differs for Psalms). */
  drChapter: number;
  raw: string;
}

/** "Jer 1:5" | "Job 10:8-12" | "Mt 5:3, 7" | "1 Cor 13" | "Ps 51" */
const REF_RE =
  /(?<![A-Za-z])((?:[1-3]|I{1,3})?\s?[A-Z][A-Za-z]+)\.?\s+(\d{1,3})(?::(\d{1,3})(?:-(\d{1,3}))?)?((?:\s*,\s*\d{1,3}(?:-\d{1,3})?)*)/g;

/**
 * Extracts Scripture references from free text such as a Catechism footnote
 * ("Jer 1:5; cf. Job 10:8-12; Ps 22:10-11."). Non-biblical citations
 * (council documents, canon law, Fathers) are ignored because their names do not
 * resolve to a book.
 */
export function parseScriptureRefs(text: string): ScriptureRef[] {
  const refs: ScriptureRef[] = [];
  // "Cf." / "cf." precedes most references; strip it so it is never read as part of a book name.
  const cleaned = text.replace(/\bcf\.?\s*/gi, " ");
  for (const m of cleaned.matchAll(REF_RE)) {
    const [, bookRaw, chapterRaw, vStart, vEnd, extra] = m;
    const book = findBook(bookRaw);
    if (!book) continue;
    const chapter = Number(chapterRaw);
    if (!Number.isFinite(chapter) || chapter < 1) continue;
    const drChapter = book.code === "PSA" ? hebrewPsalmToDouay(chapter) : chapter;
    const push = (vs?: number, ve?: number, raw?: string) =>
      refs.push({ book, chapter, verseStart: vs, verseEnd: ve ?? vs, drChapter, raw: raw ?? m[0].trim() });
    if (vStart) {
      push(Number(vStart), vEnd ? Number(vEnd) : undefined, `${book.name} ${chapter}:${vStart}${vEnd ? "-" + vEnd : ""}`);
      if (extra) {
        for (const part of extra.split(",")) {
          const p = part.trim();
          if (!p) continue;
          const [a, b] = p.split("-").map(Number);
          if (Number.isFinite(a)) push(a, Number.isFinite(b) ? b : undefined, `${book.name} ${chapter}:${p}`);
        }
      }
    } else {
      push(undefined, undefined, `${book.name} ${chapter}`);
    }
  }
  return refs;
}

/** Human-readable reference in modern naming, e.g. "Matthew 5:3-12". */
export function formatRef(book: BibleBook, chapter: number, verseStart?: number, verseEnd?: number): string {
  let s = `${book.name} ${chapter}`;
  if (verseStart) s += `:${verseStart}`;
  if (verseEnd && verseEnd !== verseStart) s += `-${verseEnd}`;
  return s;
}
