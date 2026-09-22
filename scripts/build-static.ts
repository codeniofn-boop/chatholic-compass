/**
 * Builds dist/catechism-compass.html: a single self-contained page that can be opened straight
 * from disk. It embeds the Catechism (paragraphs, heading tree, footnotes, Scripture references,
 * related paragraphs), the Douay-Rheims Bible (verses, chapter summaries, notes, search passages)
 * and the topic index as JSON, plus the browser search and UI from static/. No embeddings are
 * needed: the page ranks by keyword match, the topic index and the Catechism's own citations.
 *
 *   npm run ingest         (once, after npm run fetch-sources)
 *   npm run build-static
 *
 * The output contains the copyrighted Catechism text and is therefore never committed (dist/ is
 * gitignored); see the README on USCCB permission before distributing it.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getMeta, openDatabase } from "../lib/db";
import { BIBLE_BOOKS } from "../lib/bible-books";

const ROOT = process.cwd();
const STATIC_DIR = path.join(ROOT, "static");
const OUT = path.join(ROOT, "dist", "catechism-compass.html");

function groupBy<T, K extends string | number>(rows: T[], key: (r: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const r of rows) (out[key(r)] ??= []).push(r);
  return out;
}

function main(): void {
  const db = openDatabase({ readonly: true });

  // ---- Catechism ----
  const headings = (
    db.prepare("SELECT id, level, parent_id, label, title, first_paragraph, last_paragraph FROM ccc_headings ORDER BY id").all() as {
      id: number; level: string; parent_id: number | null; label: string; title: string; first_paragraph: number; last_paragraph: number;
    }[]
  ).map((h) => [h.id, h.level, h.parent_id, h.label, h.title, h.first_paragraph, h.last_paragraph]);

  const ccc = (
    db.prepare("SELECT n, text, heading_id, breadcrumb FROM ccc_paragraphs ORDER BY n").all() as { n: number; text: string; heading_id: number | null; breadcrumb: string }[]
  ).map((p) => {
    // The heading tree gives every breadcrumb except the Prologue's, which has no heading row.
    const prologue = p.heading_id ? null : ((JSON.parse(p.breadcrumb) as { title: string }[])[0]?.title ?? "");
    return [p.n, p.text, p.heading_id, prologue];
  });

  const footnotes = Object.fromEntries(
    Object.entries(groupBy(db.prepare("SELECT n, num, text FROM ccc_footnotes ORDER BY n, num").all() as { n: number; num: number; text: string }[], (r) => r.n)).map(([n, rows]) => [
      n,
      rows.map((r) => [r.num, r.text]),
    ]),
  );
  const refs = Object.fromEntries(
    Object.entries(
      groupBy(
        db.prepare("SELECT n, book, chapter, verse_start, verse_end, dr_chapter FROM ccc_scripture_refs ORDER BY rowid").all() as {
          n: number; book: string; chapter: number; verse_start: number | null; verse_end: number | null; dr_chapter: number;
        }[],
        (r) => r.n,
      ),
    ).map(([n, rows]) => [n, rows.map((r) => [r.book, r.chapter, r.verse_start, r.verse_end, r.dr_chapter])]),
  );
  // Related paragraphs as the article reader uses them: the 8 nearest by paragraph number.
  const related = Object.fromEntries(
    Object.entries(groupBy(db.prepare("SELECT n, related_n FROM ccc_related ORDER BY n, abs(related_n - n)").all() as { n: number; related_n: number }[], (r) => r.n)).map(
      ([n, rows]) => [n, rows.slice(0, 8).map((r) => r.related_n)],
    ),
  );

  // ---- Bible ----
  const chapterCounts = Object.fromEntries((db.prepare("SELECT code, chapters FROM bible_books").all() as { code: string; chapters: number }[]).map((b) => [b.code, b.chapters]));
  const books = BIBLE_BOOKS.map((b) => [b.code, b.order, b.name, b.drName, b.testament, b.deuterocanonical ? 1 : 0, chapterCounts[b.code] ?? 0, b.abbrevs]);
  const chapters: Record<string, Record<number, [string | null, string | null]>> = {};
  for (const c of db.prepare("SELECT book, chapter, summary, psalm_title FROM bible_chapters").all() as { book: string; chapter: number; summary: string | null; psalm_title: string | null }[]) {
    (chapters[c.book] ??= {})[c.chapter] = [c.summary, c.psalm_title];
  }
  const verses: Record<string, Record<number, (number | string | string[] | 0)[][]>> = {};
  let verseCount = 0;
  for (const v of db.prepare("SELECT book, chapter, verse, text, notes FROM bible_verses ORDER BY id").all() as { book: string; chapter: number; verse: number; text: string; notes: string | null }[]) {
    ((verses[v.book] ??= {})[v.chapter] ??= []).push(v.notes ? [v.verse, v.text, JSON.parse(v.notes) as string[]] : [v.verse, v.text]);
    verseCount++;
  }
  const passages = (
    db.prepare("SELECT id, book, chapter, verse_start, verse_end FROM bible_passages ORDER BY id").all() as { id: number; book: string; chapter: number; verse_start: number; verse_end: number }[]
  ).map((p) => [p.id, p.book, p.chapter, p.verse_start, p.verse_end]);

  // ---- Topics ----
  const topics = (
    db.prepare("SELECT slug, name, category, description, keywords, ranges, scripture FROM topics").all() as {
      slug: string; name: string; category: string; description: string; keywords: string; ranges: string; scripture: string;
    }[]
  ).map((t) => ({ ...t, keywords: JSON.parse(t.keywords) as string[], ranges: JSON.parse(t.ranges) as [number, number][], scripture: JSON.parse(t.scripture) as string[] }));

  const data = {
    built: new Date().toISOString().slice(0, 10),
    meta: { ingested_at: getMeta(db, "ingested_at"), ccc_source: getMeta(db, "ccc_source"), bible_source: getMeta(db, "bible_source") },
    headings,
    ccc,
    footnotes,
    refs,
    related,
    books,
    chapters,
    verses,
    passages,
    topics,
  };
  db.close();

  // Inside <script type="application/json"> only "</script" and "<!--" could break the page;
  // both are neutralised with JSON string escapes.
  const json = JSON.stringify(data).replace(/<\//g, "<\\/").replace(/<!--/g, "<\\u0021--");
  const html = readFileSync(path.join(STATIC_DIR, "template.html"), "utf8")
    .replace("/*__CSS__*/", () => readFileSync(path.join(STATIC_DIR, "app.css"), "utf8"))
    .replace("/*__DATA__*/", () => json)
    .replace("/*__JS__*/", () => readFileSync(path.join(STATIC_DIR, "app.js"), "utf8"));
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, html);
  console.log(
    `Wrote ${path.relative(ROOT, OUT)} (${(html.length / 1024 / 1024).toFixed(1)} MB): ${ccc.length} paragraphs, ${headings.length} headings, ${Object.keys(footnotes).length} paragraphs with footnotes, ${verseCount} verses, ${passages.length} passages, ${topics.length} topics`,
  );
}

main();
