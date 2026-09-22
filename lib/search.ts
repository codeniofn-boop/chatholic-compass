/**
 * Hybrid search over the Catechism and the Bible.
 *
 * Signals, fused with reciprocal rank fusion (RRF):
 *   keyword        FTS5 BM25 over paragraph / passage text (porter stemming)
 *   semantic       cosine similarity of all-MiniLM-L6-v2 embeddings (sqlite-vec)
 *   topic          the curated topic index: paragraph ranges and key passages for common questions
 *   scripture-link a Catechism paragraph whose footnotes cite a retrieved passage, and vice versa
 */
import type { DB } from "./db";
import { embedQuery } from "./embeddings";
import { getParagraphs } from "./ccc";
import { getPassages, findPassagesForRange, resolveReference } from "./bible";
import type { BibleGroup, BibleHit, CccGroup, CccHit, SearchResponse, TopicMatch } from "./types";

export interface SearchOptions {
  cccLimit?: number;
  bibleLimit?: number;
  /** Candidates pulled from each signal before fusion. */
  candidates?: number;
}

const RRF_K = 60;
const WEIGHTS = {
  keyword: 1.0,
  semantic: 1.15,
  topic: 1.1, // per-topic rank list, scaled by the topic's match rank
  topicBoost: 0.006, // flat bonus for candidates that fall inside a matched topic's ranges
  scriptureLink: 0.004,
  norm: 0.004, // per matched marker (max 2): paragraphs that state a norm, when the question asks whether something is a sin / allowed
  // Bible: passages the curated index or the Catechism itself points to are far more reliable
  // than free-text similarity, which is noisy for abstract doctrinal questions.
  bibleKeyword: 0.9,
  bibleSemantic: 0.9,
  bibleTopic: 1.3,
  catechismCites: 1.2, // Bible passages cited by a top Catechism hit form their own rank list
};
const IN_TOPIC_CANDIDATES = 8;

/**
 * Questions asking whether something is a sin, allowed or obligatory are best answered by the
 * paragraph that states the norm itself, which is often outranked by neighbours that discuss the
 * subject at greater length. The Catechism states norms in a small juridical vocabulary, so when
 * the question uses one of these words, candidates whose text uses one of the markers get a flat
 * bonus (like topicBoost) on top of their fused score; a paragraph that both names an obligation
 * and calls its breach a grave sin counts double.
 */
const NORM_QUERY_WORDS = new Set(["sin", "sinful", "allowed", "permitted", "forbidden", "obligation"]);
const NORM_TEXT_MARKERS = ["grave sin", "gravely", "obligation", "forbids", "permitted"];

/** Weight of the i-th matched topic (0-based): the best match counts most, later ones still matter. */
function topicRankWeight(base: number, i: number): number {
  return base / (1 + 0.5 * i);
}

const STOPWORDS = new Set(
  `a an and are as at be been but by can could did do does for from had has have how i if in into is it its
   me my of on or our should so that the their them then there these they this to us was we were what when where
   which who whom why will with would you your about say says said teach teaches teaching teachings church
   catholic catholics bible scripture position view believe believes think regarding concerning does really
   actually ever always any some something someone`.split(/\s+/),
);

export function queryTokens(query: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of query.toLowerCase().split(/[^a-z0-9']+/)) {
    const t = raw.replace(/'/g, "");
    if (t.length < 2 || STOPWORDS.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function ftsQuery(tokens: string[]): string | null {
  if (!tokens.length) return null;
  return tokens.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
}

// --- topic index ---------------------------------------------------------------------------

interface TopicRow {
  slug: string;
  name: string;
  category: string;
  description: string;
  keywords: string;
  ranges: string;
  scripture: string;
}

let topicCache: { rows: TopicRow[]; parsed: { keywords: string[]; ranges: [number, number][]; scripture: string[] }[] } | null = null;

function loadTopics(db: DB) {
  if (!topicCache) {
    const rows = db.prepare("SELECT slug, name, category, description, keywords, ranges, scripture FROM topics").all() as TopicRow[];
    topicCache = {
      rows,
      parsed: rows.map((r) => ({
        keywords: JSON.parse(r.keywords) as string[],
        ranges: JSON.parse(r.ranges) as [number, number][],
        scripture: JSON.parse(r.scripture) as string[],
      })),
    };
  }
  return topicCache;
}

function normalizeForMatch(s: string): string {
  return " " + s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
}

/** Naive singular/plural + inflection folding so "horoscopes" matches the keyword "horoscope". */
function stemWord(w: string): string {
  if (w.length <= 3) return w;
  return w
    .replace(/(ies)$/, "y")
    .replace(/(sses|shes|ches|xes)$/, (m) => m.slice(0, -2))
    .replace(/s$/, "")
    .replace(/(ing|ed)$/, "")
    .replace(/e$/, ""); // forgive / forgiving -> forgiv
}

function stemPhrase(s: string): string {
  return " " + s.trim().split(/\s+/).map(stemWord).join(" ") + " ";
}

export function matchTopics(db: DB, query: string, limit = 3): (TopicMatch & { scripture: string[]; score: number })[] {
  const { rows, parsed } = loadTopics(db);
  const q = normalizeForMatch(query);
  const qStem = stemPhrase(q);
  const matches: (TopicMatch & { scripture: string[]; score: number })[] = [];
  rows.forEach((row, i) => {
    const matched: string[] = [];
    let score = 0;
    for (const kw of parsed[i].keywords) {
      const k = normalizeForMatch(kw);
      if (q.includes(k) || qStem.includes(stemPhrase(k))) {
        matched.push(kw);
        score += k.trim().split(" ").length * 2 + 1;
      }
    }
    if (matched.length) {
      matches.push({
        slug: row.slug,
        name: row.name,
        category: row.category,
        description: row.description,
        ranges: parsed[i].ranges,
        matchedKeywords: matched,
        scripture: parsed[i].scripture,
        score,
      });
    }
  });
  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

// --- fusion helpers ------------------------------------------------------------------------

type Signal<T extends string> = T;

class Fuser<S extends string> {
  scores = new Map<number, number>();
  signals = new Map<number, Set<S>>();
  addList(ids: number[], signal: S, weight: number) {
    ids.forEach((id, rank) => this.add(id, signal, weight / (RRF_K + rank + 1)));
  }
  add(id: number, signal: S, delta: number) {
    this.scores.set(id, (this.scores.get(id) ?? 0) + delta);
    if (!this.signals.has(id)) this.signals.set(id, new Set());
    this.signals.get(id)!.add(signal);
  }
  has(id: number) {
    return this.scores.has(id);
  }
  top(n: number): { id: number; score: number; signals: S[] }[] {
    return [...this.scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id, score]) => ({ id, score, signals: [...(this.signals.get(id) ?? [])] }));
  }
}

function inRanges(n: number, ranges: [number, number][]): boolean {
  return ranges.some(([a, b]) => n >= a && n <= b);
}

// --- main ----------------------------------------------------------------------------------

export async function search(db: DB, rawQuery: string, options: SearchOptions = {}): Promise<SearchResponse> {
  const query = rawQuery.trim().replace(/\s+/g, " ");
  const cccLimit = options.cccLimit ?? 10;
  const bibleLimit = options.bibleLimit ?? 8;
  const K = options.candidates ?? 60;
  const tokens = queryTokens(query);
  const fts = ftsQuery(tokens);

  const t0 = Date.now();
  const qvec = await embedQuery(query);
  const embedMs = Date.now() - t0;
  const t1 = Date.now();

  const topics = matchTopics(db, query);

  // ---------------- Catechism ----------------
  const ccc = new Fuser<Signal<CccHit["signals"][number]>>();
  if (fts) {
    const rows = db
      .prepare("SELECT rowid AS n FROM ccc_fts WHERE ccc_fts MATCH ? ORDER BY bm25(ccc_fts, 3.0, 1.0) LIMIT ?")
      .all(fts, K) as { n: number }[];
    ccc.addList(rows.map((r) => r.n), "keyword", WEIGHTS.keyword);
  }
  const cccVec = db
    .prepare("SELECT n FROM ccc_vec WHERE embedding MATCH ? AND k = ? ORDER BY distance")
    .all(qvec, K) as { n: number }[];
  ccc.addList(cccVec.map((r) => r.n), "semantic", WEIGHTS.semantic);

  topics.forEach((topic, ti) => {
    const topicWeight = topicRankWeight(WEIGHTS.topic, ti);
    // Best-matching paragraphs inside the topic's ranges, ranked semantically.
    const inTopic: { n: number; d: number }[] = [];
    for (const [a, b] of topic.ranges) {
      const rows = db
        .prepare("SELECT n, vec_distance_cosine(embedding, ?) AS d FROM ccc_vec WHERE n BETWEEN ? AND ?")
        .all(qvec, a, b) as { n: number; d: number }[];
      inTopic.push(...rows);
    }
    inTopic.sort((a, b) => a.d - b.d);
    const topicList = inTopic.slice(0, IN_TOPIC_CANDIDATES).map((r) => r.n);
    // Also the best keyword matches inside the ranges, so a paragraph that names the thing asked
    // about ("commit a grave sin") is not lost behind semantically similar neighbours.
    if (fts) {
      for (const [a, b] of topic.ranges) {
        const rows = db
          .prepare("SELECT rowid AS n FROM ccc_fts WHERE ccc_fts MATCH ? AND rowid BETWEEN ? AND ? ORDER BY bm25(ccc_fts, 3.0, 1.0) LIMIT 4")
          .all(fts, a, b) as { n: number }[];
        for (const r of rows) if (!topicList.includes(r.n)) topicList.push(r.n);
      }
    }
    ccc.addList(topicList, "topic", topicWeight);
    for (const id of ccc.scores.keys()) {
      if (inRanges(id, topic.ranges)) ccc.add(id, "topic", topicRankWeight(WEIGHTS.topicBoost, ti));
    }
  });

  if (tokens.some((t) => NORM_QUERY_WORDS.has(t))) {
    const ids = [...ccc.scores.keys()];
    if (ids.length) {
      const markers = NORM_TEXT_MARKERS.map(() => "(text LIKE ?)").join(" + ");
      const rows = db
        .prepare(`SELECT n, markers FROM (SELECT n, ${markers} AS markers FROM ccc_paragraphs WHERE n IN (${ids.map(() => "?").join(",")})) WHERE markers > 0`)
        .all(...NORM_TEXT_MARKERS.map((m) => `%${m}%`), ...ids) as { n: number; markers: number }[];
      for (const r of rows) ccc.add(r.n, "norm", WEIGHTS.norm * Math.min(r.markers, 2));
    }
  }

  // ---------------- Bible ----------------
  const bible = new Fuser<Signal<BibleHit["signals"][number]>>();
  if (fts) {
    const rows = db
      .prepare("SELECT rowid AS id FROM bible_fts WHERE bible_fts MATCH ? ORDER BY bm25(bible_fts, 1.0, 0.5) LIMIT ?")
      .all(fts, K) as { id: number }[];
    bible.addList(rows.map((r) => r.id), "keyword", WEIGHTS.bibleKeyword);
  }
  const bibleVec = db
    .prepare("SELECT id FROM bible_vec WHERE embedding MATCH ? AND k = ? ORDER BY distance")
    .all(qvec, K) as { id: number }[];
  bible.addList(bibleVec.map((r) => r.id), "semantic", WEIGHTS.bibleSemantic);

  topics.forEach((topic, ti) => {
    const ids: number[] = [];
    for (const ref of topic.scripture) {
      for (const id of resolveReference(db, ref).slice(0, 2)) if (!ids.includes(id)) ids.push(id);
    }
    bible.addList(ids, "topic", topicRankWeight(WEIGHTS.bibleTopic, ti));
  });

  // Cross-links: passages cited by the top Catechism hits, and paragraphs citing retrieved passages.
  const cccTop = ccc.top(cccLimit);
  const citedBy = new Map<number, Set<number>>();
  const citedIds: number[] = [];
  const refStmt = db.prepare("SELECT book, dr_chapter, verse_start, verse_end FROM ccc_scripture_refs WHERE n = ?");
  for (const hit of cccTop) {
    const refs = refStmt.all(hit.id) as { book: string; dr_chapter: number; verse_start: number | null; verse_end: number | null }[];
    for (const r of refs) {
      const ids = findPassagesForRange(db, r.book, r.dr_chapter, r.verse_start, r.verse_end);
      for (const id of ids.slice(0, 2)) {
        if (!citedBy.has(id)) citedBy.set(id, new Set());
        citedBy.get(id)!.add(hit.id);
        if (!citedIds.includes(id)) citedIds.push(id);
      }
    }
  }
  // Passages cited by several top paragraphs rank first.
  citedIds.sort((a, b) => (citedBy.get(b)?.size ?? 0) - (citedBy.get(a)?.size ?? 0));
  bible.addList(citedIds, "catechism-cites", WEIGHTS.catechismCites);
  for (const id of citedIds) {
    if (bible.signals.get(id)!.size > 1) {
      for (const n of citedBy.get(id)!) ccc.add(n, "scripture-link", WEIGHTS.scriptureLink);
    }
  }

  // ---------------- hydrate + group ----------------
  const cccHits = ccc.top(cccLimit);
  const paragraphs = getParagraphs(
    db,
    cccHits.map((h) => h.id),
  );
  const cccGroupsMap = new Map<string, CccGroup>();
  const headingRange = db.prepare("SELECT first_paragraph AS first, last_paragraph AS last FROM ccc_headings WHERE id = ?");
  for (const hit of cccHits) {
    const p = paragraphs.get(hit.id);
    if (!p) continue;
    const key = String(p.headingId ?? `prologue-${p.breadcrumb[0]?.title}`);
    if (!cccGroupsMap.has(key)) {
      const range = p.headingId ? (headingRange.get(p.headingId) as { first: number; last: number } | undefined) : undefined;
      cccGroupsMap.set(key, {
        headingId: p.headingId,
        breadcrumb: p.breadcrumb,
        range: range ? [range.first, range.last] : null,
        score: hit.score,
        hits: [],
      });
    }
    const g = cccGroupsMap.get(key)!;
    g.score = Math.max(g.score, hit.score);
    g.hits.push({ ...p, score: hit.score, signals: hit.signals });
  }
  const churchTeaching = [...cccGroupsMap.values()].sort((a, b) => b.score - a.score);
  for (const g of churchTeaching) g.hits.sort((a, b) => a.n - b.n);

  const bibleHits = bible.top(bibleLimit);
  const passages = getPassages(
    db,
    bibleHits.map((h) => h.id),
  );
  const bibleGroupsMap = new Map<string, BibleGroup>();
  const chapterMeta = db.prepare("SELECT summary FROM bible_chapters WHERE book = ? AND chapter = ?");
  for (const hit of bibleHits) {
    const p = passages.get(hit.id);
    if (!p) continue;
    const key = `${p.book}:${p.chapter}`;
    if (!bibleGroupsMap.has(key)) {
      const meta = chapterMeta.get(p.book, p.chapter) as { summary: string | null } | undefined;
      bibleGroupsMap.set(key, {
        book: p.book,
        bookName: p.bookName,
        chapter: p.chapter,
        modernChapter: p.modernChapter,
        summary: meta?.summary ?? null,
        score: hit.score,
        hits: [],
      });
    }
    const g = bibleGroupsMap.get(key)!;
    g.score = Math.max(g.score, hit.score);
    g.hits.push({ ...p, score: hit.score, signals: hit.signals, citedBy: [...(citedBy.get(hit.id) ?? [])].sort((a, b) => a - b) });
  }
  const scripture = [...bibleGroupsMap.values()].sort((a, b) => b.score - a.score);
  for (const g of scripture) g.hits.sort((a, b) => a.verseStart - b.verseStart);

  return {
    query,
    topics: topics.map((t) => ({
      slug: t.slug,
      name: t.name,
      category: t.category,
      description: t.description,
      ranges: t.ranges,
      matchedKeywords: t.matchedKeywords,
    })),
    churchTeaching,
    scripture,
    timings: { embedMs, searchMs: Date.now() - t1 },
  };
}
