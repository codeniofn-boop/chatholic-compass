import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DB_PATH } from "./paths";

export const EMBEDDING_DIM = 384;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Heading tree of the Catechism: Part > Section > Chapter > Article.
CREATE TABLE IF NOT EXISTS ccc_headings (
  id INTEGER PRIMARY KEY,
  level TEXT NOT NULL,            -- 'part' | 'section' | 'chapter' | 'article'
  parent_id INTEGER REFERENCES ccc_headings(id),
  part INTEGER NOT NULL,
  section INTEGER,
  chapter INTEGER,
  article INTEGER,
  label TEXT NOT NULL,            -- e.g. "Part Three", "Article 5"
  title TEXT NOT NULL,            -- e.g. "The Fifth Commandment"
  first_paragraph INTEGER,
  last_paragraph INTEGER
);

CREATE TABLE IF NOT EXISTS ccc_paragraphs (
  n INTEGER PRIMARY KEY,          -- paragraph number 1..2865
  text TEXT NOT NULL,
  part INTEGER,
  section INTEGER,
  chapter INTEGER,
  article INTEGER,
  heading_id INTEGER REFERENCES ccc_headings(id),
  breadcrumb TEXT NOT NULL,       -- JSON: [{level,label,title}]
  source_url TEXT
);

CREATE TABLE IF NOT EXISTS ccc_footnotes (
  n INTEGER NOT NULL REFERENCES ccc_paragraphs(n),
  num INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (n, num)
);

-- Scripture references parsed out of the footnotes, resolved to book codes.
CREATE TABLE IF NOT EXISTS ccc_scripture_refs (
  n INTEGER NOT NULL REFERENCES ccc_paragraphs(n),
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,       -- in the source (modern/Hebrew) numbering
  verse_start INTEGER,
  verse_end INTEGER,
  dr_chapter INTEGER NOT NULL,    -- chapter in the Douay-Rheims numbering (differs for Psalms)
  raw TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ccc_scripture_refs_n ON ccc_scripture_refs(n);
CREATE INDEX IF NOT EXISTS ccc_scripture_refs_loc ON ccc_scripture_refs(book, dr_chapter);

-- Related paragraphs: 'compendium' = cited together by the same Compendium question.
CREATE TABLE IF NOT EXISTS ccc_related (
  n INTEGER NOT NULL,
  related_n INTEGER NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (n, related_n, source)
);

CREATE VIRTUAL TABLE IF NOT EXISTS ccc_fts USING fts5(
  text, headings, tokenize = 'porter unicode61'
);

CREATE TABLE IF NOT EXISTS bible_books (
  code TEXT PRIMARY KEY,
  ord INTEGER NOT NULL,
  name TEXT NOT NULL,
  dr_name TEXT NOT NULL,
  testament TEXT NOT NULL,
  deuterocanonical INTEGER NOT NULL,
  chapters INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bible_chapters (
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  summary TEXT,                   -- Challoner's chapter description
  psalm_title TEXT,               -- Latin incipit for Psalms (e.g. "Miserere")
  PRIMARY KEY (book, chapter)
);

CREATE TABLE IF NOT EXISTS bible_verses (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL,
  notes TEXT,                     -- JSON array of Challoner's annotations, or NULL
  UNIQUE (book, chapter, verse)
);

-- Short passages (a few verses) used as the unit of search.
CREATE TABLE IF NOT EXISTS bible_passages (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse_start INTEGER NOT NULL,
  verse_end INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bible_passages_loc ON bible_passages(book, chapter, verse_start);

CREATE VIRTUAL TABLE IF NOT EXISTS bible_fts USING fts5(
  text, reference, tokenize = 'porter unicode61'
);

-- Curated topic index: common questions -> paragraph ranges and key passages.
CREATE TABLE IF NOT EXISTS topics (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  keywords TEXT NOT NULL,         -- JSON array
  ranges TEXT NOT NULL,           -- JSON array of [first, last]
  scripture TEXT NOT NULL         -- JSON array of reference strings
);
`;

// sqlite-vec virtual tables cannot use IF NOT EXISTS on older versions, so create them separately.
const VEC_SQL = [
  `CREATE VIRTUAL TABLE ccc_vec USING vec0(n INTEGER PRIMARY KEY, embedding float[${EMBEDDING_DIM}] distance_metric=cosine)`,
  `CREATE VIRTUAL TABLE bible_vec USING vec0(id INTEGER PRIMARY KEY, embedding float[${EMBEDDING_DIM}] distance_metric=cosine)`,
];

export type DB = Database.Database;

export function openDatabase(options: { readonly?: boolean; create?: boolean } = {}): DB {
  const readonly = options.readonly ?? false;
  if (!readonly && !existsSync(DB_PATH)) {
    if (!options.create) throw new Error(`Database not found at ${DB_PATH}. Run \`npm run setup\` first.`);
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  const db = new Database(DB_PATH, { readonly, fileMustExist: readonly });
  sqliteVec.load(db);
  db.pragma("journal_mode = WAL");
  if (!readonly) {
    db.exec(SCHEMA_SQL);
    const existing = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => (r as { name: string }).name),
    );
    if (!existing.has("ccc_vec")) db.exec(VEC_SQL[0]);
    if (!existing.has("bible_vec")) db.exec(VEC_SQL[1]);
  }
  return db;
}

let shared: DB | null = null;

/** Read-only shared connection for the web app (one per process). */
export function getDb(): DB {
  if (!shared) shared = openDatabase({ readonly: true });
  return shared;
}

export function getMeta(db: DB, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setMeta(db: DB, key: string, value: string): void {
  db.prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
