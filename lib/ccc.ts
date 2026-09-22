import type { DB } from "./db";
import { BOOK_BY_CODE } from "./bible-books";
import { formatRef } from "./scripture-refs";
import type { CccParagraph, Crumb, Footnote, ScriptureRef } from "./types";

interface ParagraphRow {
  n: number;
  text: string;
  breadcrumb: string;
  heading_id: number | null;
}

function rowToParagraph(db: DB, row: ParagraphRow, withNotes: boolean): CccParagraph {
  const footnotes: Footnote[] = withNotes
    ? (db.prepare("SELECT num, text FROM ccc_footnotes WHERE n = ? ORDER BY num").all(row.n) as Footnote[])
    : [];
  const scriptureRefs: ScriptureRef[] = withNotes
    ? (
        db
          .prepare("SELECT book, chapter, verse_start, verse_end, dr_chapter, raw FROM ccc_scripture_refs WHERE n = ?")
          .all(row.n) as { book: string; chapter: number; verse_start: number | null; verse_end: number | null; dr_chapter: number; raw: string }[]
      ).map((r) => ({
        book: r.book,
        bookName: BOOK_BY_CODE[r.book]?.name ?? r.book,
        chapter: r.chapter,
        verseStart: r.verse_start,
        verseEnd: r.verse_end,
        drChapter: r.dr_chapter,
        raw: r.raw,
        reference: formatRef(BOOK_BY_CODE[r.book], r.chapter, r.verse_start ?? undefined, r.verse_end ?? undefined),
      }))
    : [];
  return {
    n: row.n,
    text: row.text,
    breadcrumb: JSON.parse(row.breadcrumb) as Crumb[],
    headingId: row.heading_id,
    footnotes,
    scriptureRefs,
  };
}

export function getParagraph(db: DB, n: number, withNotes = true): CccParagraph | null {
  const row = db.prepare("SELECT n, text, breadcrumb, heading_id FROM ccc_paragraphs WHERE n = ?").get(n) as ParagraphRow | undefined;
  return row ? rowToParagraph(db, row, withNotes) : null;
}

export function getParagraphs(db: DB, ns: number[], withNotes = true): Map<number, CccParagraph> {
  const out = new Map<number, CccParagraph>();
  if (!ns.length) return out;
  const rows = db
    .prepare(`SELECT n, text, breadcrumb, heading_id FROM ccc_paragraphs WHERE n IN (${ns.map(() => "?").join(",")})`)
    .all(...ns) as ParagraphRow[];
  for (const r of rows) out.set(r.n, rowToParagraph(db, r, withNotes));
  return out;
}

export interface HeadingInfo {
  id: number;
  level: string;
  label: string;
  title: string;
  first: number;
  last: number;
  breadcrumb: Crumb[];
}

export function getHeading(db: DB, id: number): HeadingInfo | null {
  const row = db
    .prepare("SELECT id, level, parent_id, label, title, first_paragraph AS first, last_paragraph AS last FROM ccc_headings WHERE id = ?")
    .get(id) as { id: number; level: string; parent_id: number | null; label: string; title: string; first: number; last: number } | undefined;
  if (!row) return null;
  const crumbs: Crumb[] = [];
  let cur: typeof row | undefined = row;
  while (cur) {
    crumbs.unshift({ level: cur.level as Crumb["level"], label: cur.label, title: cur.title });
    cur = cur.parent_id
      ? (db
          .prepare("SELECT id, level, parent_id, label, title, first_paragraph AS first, last_paragraph AS last FROM ccc_headings WHERE id = ?")
          .get(cur.parent_id) as typeof row)
      : undefined;
  }
  return { id: row.id, level: row.level, label: row.label, title: row.title, first: row.first, last: row.last, breadcrumb: crumbs };
}

/**
 * Paragraph `n` with its neighbours, clipped to the article (or nearest heading unit) that
 * contains it, so "read the surrounding paragraphs" never drifts into another topic.
 */
export function getContext(db: DB, n: number, before = 2, after = 2): { paragraphs: CccParagraph[]; unit: HeadingInfo | null } {
  const p = getParagraph(db, n, false);
  if (!p) return { paragraphs: [], unit: null };
  const unit = p.headingId ? getHeading(db, p.headingId) : null;
  const lo = Math.max(unit?.first ?? 1, n - before);
  const hi = Math.min(unit?.last ?? 2865, n + after);
  const rows = db
    .prepare("SELECT n, text, breadcrumb, heading_id FROM ccc_paragraphs WHERE n BETWEEN ? AND ? ORDER BY n")
    .all(lo, hi) as ParagraphRow[];
  return { paragraphs: rows.map((r) => rowToParagraph(db, r, true)), unit };
}

/** Paragraphs the Compendium groups with `n` (same question), most co-cited first. */
export function getRelated(db: DB, n: number, limit = 8): number[] {
  return (
    db
      .prepare("SELECT related_n FROM ccc_related WHERE n = ? ORDER BY abs(related_n - ?) LIMIT ?")
      .all(n, n, limit) as { related_n: number }[]
  ).map((r) => r.related_n);
}
