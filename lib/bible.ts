import type { DB } from "./db";
import { BOOK_BY_CODE, douayPsalmToHebrew, findBook, hebrewPsalmToDouay } from "./bible-books";
import type { BiblePassage } from "./types";

interface PassageRow {
  id: number;
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  text: string;
}

export function referenceLabel(book: string, chapter: number, verseStart?: number, verseEnd?: number): string {
  const b = BOOK_BY_CODE[book];
  const name = book === "PSA" ? "Psalm" : (b?.name ?? book);
  const ch = book === "PSA" ? douayPsalmToHebrew(chapter) : String(chapter);
  let s = `${name} ${ch}`;
  if (verseStart) s += `:${verseStart}`;
  if (verseEnd && verseEnd !== verseStart) s += `-${verseEnd}`;
  return s;
}

function rowToPassage(db: DB, row: PassageRow): BiblePassage {
  const b = BOOK_BY_CODE[row.book];
  const verses = (
    db
      .prepare("SELECT verse, text, notes FROM bible_verses WHERE book = ? AND chapter = ? AND verse BETWEEN ? AND ? ORDER BY verse")
      .all(row.book, row.chapter, row.verse_start, row.verse_end) as { verse: number; text: string; notes: string | null }[]
  ).map((v) => ({ verse: v.verse, text: v.text, notes: v.notes ? (JSON.parse(v.notes) as string[]) : [] }));
  return {
    id: row.id,
    book: row.book,
    bookName: b?.name ?? row.book,
    drBookName: b?.drName ?? row.book,
    chapter: row.chapter,
    modernChapter: row.book === "PSA" ? douayPsalmToHebrew(row.chapter) : String(row.chapter),
    verseStart: row.verse_start,
    verseEnd: row.verse_end,
    reference: referenceLabel(row.book, row.chapter, row.verse_start, row.verse_end),
    text: row.text,
    verses,
  };
}

export function getPassages(db: DB, ids: number[]): Map<number, BiblePassage> {
  const out = new Map<number, BiblePassage>();
  if (!ids.length) return out;
  const rows = db
    .prepare(`SELECT id, book, chapter, verse_start, verse_end, text FROM bible_passages WHERE id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as PassageRow[];
  for (const r of rows) out.set(r.id, rowToPassage(db, r));
  return out;
}

/** Passages overlapping a verse range (in Douay-Rheims chapter numbering). */
export function findPassagesForRange(db: DB, book: string, drChapter: number, verseStart?: number | null, verseEnd?: number | null): number[] {
  if (!verseStart) {
    return (
      db.prepare("SELECT id FROM bible_passages WHERE book = ? AND chapter = ? ORDER BY verse_start LIMIT 3").all(book, drChapter) as { id: number }[]
    ).map((r) => r.id);
  }
  const end = verseEnd ?? verseStart;
  return (
    db
      .prepare("SELECT id FROM bible_passages WHERE book = ? AND chapter = ? AND verse_end >= ? AND verse_start <= ? ORDER BY verse_start")
      .all(book, drChapter, verseStart, end) as { id: number }[]
  ).map((r) => r.id);
}

/**
 * Resolve a human reference ("Matthew 5:3-12", "Ps 51", "1 Cor 13:4-7", modern numbering) to
 * passage ids. Returns [] when the book is unknown.
 */
export function resolveReference(db: DB, ref: string): number[] {
  const m = ref.trim().match(/^((?:[1-3]\s?)?[A-Za-z]+(?:\s(?:of\s)?[A-Za-z]+)*)\.?\s+(\d{1,3})(?::(\d{1,3})(?:-(\d{1,3}))?)?$/);
  if (!m) return [];
  const book = findBook(m[1]);
  if (!book) return [];
  const chapter = Number(m[2]);
  const drChapter = book.code === "PSA" ? hebrewPsalmToDouay(chapter) : chapter;
  return findPassagesForRange(db, book.code, drChapter, m[3] ? Number(m[3]) : null, m[4] ? Number(m[4]) : null);
}

export function getChapter(db: DB, book: string, chapter: number) {
  const b = BOOK_BY_CODE[book];
  if (!b) return null;
  const meta = db.prepare("SELECT summary, psalm_title FROM bible_chapters WHERE book = ? AND chapter = ?").get(book, chapter) as
    | { summary: string | null; psalm_title: string | null }
    | undefined;
  if (!meta) return null;
  const verses = (
    db.prepare("SELECT verse, text, notes FROM bible_verses WHERE book = ? AND chapter = ? ORDER BY verse").all(book, chapter) as {
      verse: number;
      text: string;
      notes: string | null;
    }[]
  ).map((v) => ({ verse: v.verse, text: v.text, notes: v.notes ? (JSON.parse(v.notes) as string[]) : [] }));
  const chapters = (db.prepare("SELECT chapters FROM bible_books WHERE code = ?").get(book) as { chapters: number }).chapters;
  return {
    book: b.code,
    bookName: b.name,
    drBookName: b.drName,
    chapter,
    modernChapter: book === "PSA" ? douayPsalmToHebrew(chapter) : String(chapter),
    chapters,
    summary: meta.summary,
    psalmTitle: meta.psalm_title,
    verses,
  };
}
