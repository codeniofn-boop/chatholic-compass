/**
 * Builds data/compass.db from the downloaded sources (run `npm run fetch-sources` first):
 *   - Catechism paragraphs, heading tree, footnotes, Scripture references, related paragraphs
 *   - Douay-Rheims verses, chapter summaries, notes, search passages
 *   - curated topic index (data/topics.json)
 * Rebuilds the text tables from scratch on every run; embeddings (npm run embed) are kept
 * when the paragraph/passage ids are unchanged.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { openDatabase, setMeta, type DB } from "../lib/db";
import { BIBLE_BOOKS, BOOK_BY_CODE, type BibleBook } from "../lib/bible-books";
import { parseScriptureRefs } from "../lib/scripture-refs";
import { DATA_DIR, RAW_DIR } from "../lib/paths";
import { titleCase } from "../lib/text";

const CORPUS_ROOT = path.join(RAW_DIR, "corpus", "github-catholic-doctrine-magisterium-rag-corpus");
const CCC_JSONL = path.join(CORPUS_ROOT, "source/canonical/catechism/CCC.jsonl");
const XREF_JSON = path.join(CORPUS_ROOT, "source/derived/cross_reference_graph.json");
const DR_DIR = path.join(RAW_DIR, "douay-rheims-usfm");
const TOPICS_JSON = path.join(DATA_DIR, "topics.json");

// ---------------------------------------------------------------------------------------------
// Catechism
// ---------------------------------------------------------------------------------------------

interface CorpusRecord {
  language: string;
  paragraph: number;
  text: string;
  part: number | null;
  section: number | null;
  chapter: number | null;
  article: number | null;
  unit_title: string;
  footnotes: { number: number; text: string }[] | null;
  source_url: string | null;
}

type Level = "part" | "section" | "chapter" | "article";
type Crumb = { level: Level; label: string; title: string };

// Titles for the few units whose heading is not carried by any paragraph in the corpus, or whose
// corpus heading is garbled. Keys: "p", "p.s", "p.s.c".
const TITLE_OVERRIDES: Record<string, string> = {
  "1": "The Profession of Faith",
  "4": "Christian Prayer",
  "1.2": "The Profession of the Christian Faith",
  "3.1": "Man's Vocation: Life in the Spirit",
  "2.1.1": "The Paschal Mystery in the Age of the Church",
  "2.2.4": "Other Liturgical Celebrations",
};

const ORDINALS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

function splitUnitTitle(unitTitle: string): { level: Level | null; title: string } {
  const t = unitTitle.trim();
  const m = t.match(/^(PART|SECTION|CHAPTER|ARTICLE)\s+[A-Z0-9]+\s*[:—-]?\s*(.*)$/i);
  if (!m) return { level: null, title: t };
  return { level: m[1].toLowerCase() as Level, title: titleCase(m[2].trim()) };
}

function ingestCatechism(db: DB): void {
  console.log("Catechism: reading", CCC_JSONL);
  const records = readFileSync(CCC_JSONL, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as CorpusRecord)
    .filter((r) => r.language === "en")
    .sort((a, b) => a.paragraph - b.paragraph);
  if (records.length !== 2865) throw new Error(`Expected 2865 English paragraphs, found ${records.length}`);

  // 1. Collect heading titles from the corpus (each paragraph carries its innermost heading).
  const titles: Record<Level, Map<string, string>> = {
    part: new Map(),
    section: new Map(),
    chapter: new Map(),
    article: new Map(),
  };
  const keyFor = (r: CorpusRecord, level: Level) =>
    level === "part"
      ? `${r.part}`
      : level === "section"
        ? `${r.part}.${r.section}`
        : level === "chapter"
          ? `${r.part}.${r.section}.${r.chapter}`
          : `${r.part}.${r.section}.${r.chapter ?? 0}.${r.article}`;
  for (const r of records) {
    const { level, title } = splitUnitTitle(r.unit_title);
    if (level && r.part) titles[level].set(keyFor(r, level), title);
  }
  for (const [k, v] of Object.entries(TITLE_OVERRIDES)) {
    const level: Level = (["part", "section", "chapter"] as Level[])[k.split(".").length - 1];
    titles[level].set(k, v);
  }

  // 2. Build the heading tree in paragraph order.
  db.exec("DELETE FROM ccc_footnotes; DELETE FROM ccc_scripture_refs; DELETE FROM ccc_related; DELETE FROM ccc_fts; DELETE FROM ccc_paragraphs; DELETE FROM ccc_headings;");
  const insertHeading = db.prepare(
    `INSERT INTO ccc_headings(level, parent_id, part, section, chapter, article, label, title, first_paragraph, last_paragraph)
     VALUES (@level, @parent_id, @part, @section, @chapter, @article, @label, @title, @first, @last)`,
  );
  const updateLast = db.prepare("UPDATE ccc_headings SET last_paragraph = ? WHERE id = ?");
  const headingIds = new Map<string, number>();
  const ensureHeading = (level: Level, r: CorpusRecord): number | null => {
    if (!r.part) return null;
    if (level === "section" && !r.section) return null;
    if (level === "chapter" && !r.chapter) return null;
    if (level === "article" && !r.article) return null;
    const key = `${level}:${keyFor(r, level)}`;
    const existing = headingIds.get(key);
    if (existing) {
      updateLast.run(r.paragraph, existing);
      return existing;
    }
    const parentLevel: Level | null = level === "part" ? null : level === "section" ? "part" : level === "chapter" ? "section" : r.chapter ? "chapter" : "section";
    const parentId = parentLevel ? ensureHeading(parentLevel, r) : null;
    const num = level === "part" ? r.part : level === "section" ? r.section! : level === "chapter" ? r.chapter! : r.article!;
    const label = level === "article" ? `Article ${num}` : `${titleCase(level)} ${ORDINALS[num] ?? num}`;
    const title = titles[level].get(keyFor(r, level)) ?? "";
    if (!title) console.warn(`  no title for ${label} (${keyFor(r, level)})`);
    const info = insertHeading.run({
      level,
      parent_id: parentId,
      part: r.part,
      section: level === "part" ? null : r.section,
      chapter: level === "part" || level === "section" ? null : r.chapter,
      article: level === "article" ? r.article : null,
      label,
      title,
      first: r.paragraph,
      last: r.paragraph,
    });
    const id = Number(info.lastInsertRowid);
    headingIds.set(key, id);
    return id;
  };

  const insertParagraph = db.prepare(
    `INSERT INTO ccc_paragraphs(n, text, part, section, chapter, article, heading_id, breadcrumb, source_url)
     VALUES (@n, @text, @part, @section, @chapter, @article, @heading_id, @breadcrumb, @source_url)`,
  );
  const insertFootnote = db.prepare("INSERT INTO ccc_footnotes(n, num, text) VALUES (?, ?, ?)");
  const insertRef = db.prepare(
    "INSERT INTO ccc_scripture_refs(n, book, chapter, verse_start, verse_end, dr_chapter, raw) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insertFts = db.prepare("INSERT INTO ccc_fts(rowid, text, headings) VALUES (?, ?, ?)");

  let refCount = 0;
  const tx = db.transaction(() => {
    for (const r of records) {
      const crumbs: Crumb[] = [];
      let headingId: number | null = null;
      if (r.part) {
        for (const level of ["part", "section", "chapter", "article"] as Level[]) {
          const id = ensureHeading(level, r);
          if (id) {
            headingId = id;
            const h = db.prepare("SELECT label, title FROM ccc_headings WHERE id = ?").get(id) as { label: string; title: string };
            crumbs.push({ level, label: h.label, title: h.title });
          }
        }
      } else {
        crumbs.push({ level: "part", label: "Prologue", title: titleCase(r.unit_title.replace(/^[IVX]+\.\s*/, "")) });
      }
      const text = r.text.replace(/\s+/g, " ").trim();
      insertParagraph.run({
        n: r.paragraph,
        text,
        part: r.part,
        section: r.section,
        chapter: r.chapter,
        article: r.article,
        heading_id: headingId,
        breadcrumb: JSON.stringify(crumbs),
        source_url: r.source_url,
      });
      insertFts.run(r.paragraph, text, crumbs.map((c) => c.title).join(" / "));
      for (const f of r.footnotes ?? []) {
        insertFootnote.run(r.paragraph, f.number, f.text);
        for (const ref of parseScriptureRefs(f.text)) {
          insertRef.run(r.paragraph, ref.book.code, ref.chapter, ref.verseStart ?? null, ref.verseEnd ?? null, ref.drChapter, ref.raw);
          refCount++;
        }
      }
    }
  });
  tx();

  // 3. Related paragraphs: paragraphs cited together by the same Compendium question.
  let relatedCount = 0;
  if (existsSync(XREF_JSON)) {
    const graph = JSON.parse(readFileSync(XREF_JSON, "utf8")) as {
      edges: { relation: string; source_record_id: string; target_record_id: string }[];
    };
    const byQuestion = new Map<string, Set<number>>();
    for (const e of graph.edges) {
      if (e.relation !== "compendium_references_catechism_paragraph") continue;
      const m = e.target_record_id.match(/^mag:CCC:(\d+):en$/);
      if (!m) continue;
      const q = e.source_record_id.replace(/:(en|la)$/, "");
      if (!byQuestion.has(q)) byQuestion.set(q, new Set());
      byQuestion.get(q)!.add(Number(m[1]));
    }
    const insertRelated = db.prepare("INSERT OR IGNORE INTO ccc_related(n, related_n, source) VALUES (?, ?, 'compendium')");
    const relTx = db.transaction(() => {
      for (const set of byQuestion.values()) {
        const list = [...set];
        if (list.length > 40) continue; // a handful of questions cite very broad ranges; skip those
        for (const a of list) for (const b of list) if (a !== b) relatedCount += insertRelated.run(a, b).changes;
      }
    });
    relTx();
  }

  const headings = (db.prepare("SELECT count(*) c FROM ccc_headings").get() as { c: number }).c;
  console.log(`Catechism: ${records.length} paragraphs, ${headings} headings, ${refCount} Scripture references, ${relatedCount} related links`);
}

// ---------------------------------------------------------------------------------------------
// Douay-Rheims Bible (USFM)
// ---------------------------------------------------------------------------------------------

const FILE_CODE_FIXES: Record<string, string> = { JAM: "JAS" };

interface Verse {
  verse: number;
  text: string;
  notes: string[];
}

function cleanInline(raw: string, notes: string[]): string {
  let s = raw;
  // Footnotes: \f + \fr 5:3 \fk The poor in spirit: \ft That is, the humble...\f*
  s = s.replace(/\\f\s[^]*?\\f\*\*?/g, (m) => {
    const key = m.match(/\\fk\s([^\\]*)/)?.[1]?.trim() ?? "";
    const body = m.match(/\\ft\s([^\\]*)/)?.[1]?.trim() ?? "";
    const note = [key, body].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (note) notes.push(note);
    return "";
  });
  s = s.replace(/\\rq\s[^]*?\\rq\*/g, ""); // cross references
  s = s.replace(/\\vp\s[^]*?\\vp\*/g, ""); // published verse numbers
  s = s.replace(/\\(w|it|bd|nd|qs|wj|sc|tl|k)\s([^]*?)\\\1\*/g, "$2");
  s = s.replace(/\\[a-z]+\d?\*?/g, ""); // any remaining markers
  return s.replace(/\s+/g, " ").trim();
}

function parseUsfm(content: string): {
  chapters: Map<number, { verses: Verse[]; summary?: string; psalmTitle?: string }>;
} {
  const chapters = new Map<number, { verses: Verse[]; summary?: string; psalmTitle?: string }>();
  let chapter = 0;
  let current: Verse | null = null;
  let pendingNotes: string[] = [];
  const flush = () => {
    if (current && chapter) {
      current.text = cleanInline(current.text, pendingNotes);
      current.notes = pendingNotes;
      chapters.get(chapter)!.verses.push(current);
    }
    current = null;
    pendingNotes = [];
  };
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^\\([a-z]+\d*)\s?(.*)$/);
    if (!m) {
      if (current) current.text += " " + line;
      continue;
    }
    const [, marker, rest] = m;
    if (marker === "c") {
      flush();
      chapter = Number(rest.trim());
      if (!chapters.has(chapter)) chapters.set(chapter, { verses: [] });
    } else if (marker === "v") {
      flush();
      const vm = rest.match(/^(\d+)\s*(.*)$/s);
      if (!vm) continue;
      current = { verse: Number(vm[1]), text: vm[2], notes: [] };
    } else if (marker === "cd") {
      flush();
      if (chapter) chapters.get(chapter)!.summary = rest.trim();
    } else if (marker === "s1" || marker === "s") {
      flush();
      if (chapter) chapters.get(chapter)!.psalmTitle = rest.trim().replace(/\.$/, "");
    } else if (/^(q\d?|m|pi\d?|li\d?|b|nb|pmo|pm|pc)$/.test(marker)) {
      // poetry / paragraph continuation lines: text after the marker belongs to the current verse
      if (current && rest.trim()) current.text += " " + rest.trim();
    } else if (marker === "p" || marker === "d" || marker === "cl") {
      // paragraph break / psalm title marker / chapter label: no text to keep
      if (current && rest.trim() && marker === "p") current.text += " " + rest.trim();
    }
    // \id \h \toc* \mt* \im* \ide \rem ...: ignored
  }
  flush();
  return { chapters };
}

function buildPassages(verses: Verse[]): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  let group: Verse[] = [];
  let words = 0;
  const push = () => {
    if (!group.length) return;
    out.push({ start: group[0].verse, end: group[group.length - 1].verse, text: group.map((v) => v.text).join(" ") });
    group = [];
    words = 0;
  };
  for (const v of verses) {
    const w = v.text.split(/\s+/).length;
    if (group.length && (words + w > 110 || group.length >= 5)) push();
    group.push(v);
    words += w;
  }
  // Avoid a dangling one-verse passage at the end of a chapter.
  if (group.length === 1 && out.length) {
    const last = out[out.length - 1];
    last.end = group[0].verse;
    last.text += " " + group[0].text;
    group = [];
  }
  push();
  return out;
}

function ingestBible(db: DB): void {
  console.log("Bible: reading USFM from", DR_DIR);
  const files = readdirSync(DR_DIR).filter((f) => /^\d\d-[A-Z0-9]{3}-.*DRC1750.*\.sfm$/.test(f));
  db.exec("DELETE FROM bible_books; DELETE FROM bible_chapters; DELETE FROM bible_verses; DELETE FROM bible_passages; DELETE FROM bible_fts;");
  const insertBook = db.prepare("INSERT INTO bible_books(code, ord, name, dr_name, testament, deuterocanonical, chapters) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const insertChapter = db.prepare("INSERT INTO bible_chapters(book, chapter, summary, psalm_title) VALUES (?, ?, ?, ?)");
  const insertVerse = db.prepare("INSERT INTO bible_verses(book, chapter, verse, text, notes) VALUES (?, ?, ?, ?, ?)");
  const insertPassage = db.prepare("INSERT INTO bible_passages(book, chapter, verse_start, verse_end, text) VALUES (?, ?, ?, ?, ?)");
  const insertFts = db.prepare("INSERT INTO bible_fts(rowid, text, reference) VALUES (?, ?, ?)");

  let verseCount = 0;
  let passageCount = 0;
  const seen = new Set<string>();
  const tx = db.transaction(() => {
    for (const file of files) {
      const fileCode = file.split("-")[1];
      const code = FILE_CODE_FIXES[fileCode] ?? fileCode;
      const book: BibleBook | undefined = BOOK_BY_CODE[code];
      if (!book) continue; // front matter, glossary, appendices
      seen.add(code);
      const { chapters } = parseUsfm(readFileSync(path.join(DR_DIR, file), "utf8"));
      insertBook.run(book.code, book.order, book.name, book.drName, book.testament, book.deuterocanonical ? 1 : 0, chapters.size);
      for (const [chapter, data] of [...chapters.entries()].sort((a, b) => a[0] - b[0])) {
        insertChapter.run(book.code, chapter, data.summary ?? null, data.psalmTitle ?? null);
        for (const v of data.verses) {
          insertVerse.run(book.code, chapter, v.verse, v.text, v.notes.length ? JSON.stringify(v.notes) : null);
          verseCount++;
        }
        for (const p of buildPassages(data.verses)) {
          const info = insertPassage.run(book.code, chapter, p.start, p.end, p.text);
          const ref = `${book.name} ${chapter}${book.name !== book.drName ? " " + book.drName : ""}`;
          insertFts.run(info.lastInsertRowid, p.text, ref);
          passageCount++;
        }
      }
    }
  });
  tx();
  const missing = BIBLE_BOOKS.filter((b) => !seen.has(b.code)).map((b) => b.code);
  if (missing.length) throw new Error(`Bible books missing from USFM source: ${missing.join(", ")}`);
  console.log(`Bible: ${seen.size} books, ${verseCount} verses, ${passageCount} passages`);
}

// ---------------------------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------------------------

interface TopicJson {
  slug: string;
  name: string;
  category: string;
  description: string;
  keywords: string[];
  ranges: [number, number][];
  scripture: string[];
}

function ingestTopics(db: DB): void {
  if (!existsSync(TOPICS_JSON)) {
    console.warn("Topics: data/topics.json not found, skipping");
    return;
  }
  const topics = JSON.parse(readFileSync(TOPICS_JSON, "utf8")) as TopicJson[];
  db.exec("DELETE FROM topics;");
  const insert = db.prepare("INSERT INTO topics(slug, name, category, description, keywords, ranges, scripture) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const tx = db.transaction(() => {
    for (const t of topics) {
      for (const [a, b] of t.ranges) if (!(a >= 1 && b <= 2865 && a <= b)) throw new Error(`Topic ${t.slug}: bad range ${a}-${b}`);
      insert.run(t.slug, t.name, t.category, t.description, JSON.stringify(t.keywords), JSON.stringify(t.ranges), JSON.stringify(t.scripture));
    }
  });
  tx();
  console.log(`Topics: ${topics.length}`);
}

// ---------------------------------------------------------------------------------------------

function main(): void {
  if (!existsSync(CCC_JSONL) || !existsSync(DR_DIR)) {
    throw new Error("Source texts not found. Run `npm run fetch-sources` first.");
  }
  const db = openDatabase({ create: true });
  ingestCatechism(db);
  ingestBible(db);
  ingestTopics(db);
  // Drop Scripture references whose chapter does not exist (source transcription slips such as
  // "1 Jn 16-17" for 1 Jn 5:16-17) so they never link to the wrong text.
  const dropped = db
    .prepare("DELETE FROM ccc_scripture_refs WHERE dr_chapter > (SELECT chapters FROM bible_books WHERE code = book)")
    .run().changes;
  if (dropped) console.log(`Dropped ${dropped} Scripture references with out-of-range chapters`);
  // Drop embeddings whose rows no longer exist (ids are stable across re-ingests, so usually a no-op).
  db.exec("DELETE FROM ccc_vec WHERE n NOT IN (SELECT n FROM ccc_paragraphs)");
  db.exec("DELETE FROM bible_vec WHERE id NOT IN (SELECT id FROM bible_passages)");
  setMeta(db, "ingested_at", new Date().toISOString());
  setMeta(db, "ccc_source", "AD IPSUM Catholic Doctrine and Magisterium RAG Corpus v1.0.0 (CCC.jsonl, English)");
  setMeta(db, "bible_source", "Douay-Rheims Bible, Challoner revision (BibleCorps ENG-B-DRC1750-pd-PSFM, public domain)");
  db.close();
  console.log("Done:", process.env.DATABASE_PATH ?? "data/compass.db");
}

main();
