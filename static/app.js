/*
 * Catechism Compass, single-file edition. Everything runs in the browser from the JSON embedded in
 * this page: no server, no network. The search mirrors lib/search.ts minus the embedding signal:
 * keyword scoring (FTS5-style BM25 with Porter stemming), the curated topic index with the same
 * keyword matcher and stemmer, the rule-marker ("norm") bonus, and the Catechism's own Scripture
 * citations, fused with reciprocal rank fusion.
 */
(function () {
  "use strict";

  const D = JSON.parse(document.getElementById("cc-data").textContent);
  const MAX_N = 2865;

  // ---------------------------------------------------------------------------------------------
  // Bible books (lib/bible-books.ts)
  // ---------------------------------------------------------------------------------------------
  const BOOKS = D.books.map((b) => ({ code: b[0], order: b[1], name: b[2], drName: b[3], testament: b[4], deuterocanonical: !!b[5], chapters: b[6], abbrevs: b[7] }));
  const BOOK_BY_CODE = Object.fromEntries(BOOKS.map((b) => [b.code, b]));
  const ABBREV = new Map();
  for (const b of BOOKS) {
    ABBREV.set(normalizeBookKey(b.name), b);
    ABBREV.set(normalizeBookKey(b.drName), b);
    for (const a of b.abbrevs) ABBREV.set(normalizeBookKey(a), b);
  }
  function normalizeBookKey(raw) {
    let s = raw.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
    s = s.replace(/^(iii|ii|i)(?=[a-z])/, (m) => String(m.length));
    s = s.replace(/^(first|second|third)(?=[a-z])/, (m) => ({ first: "1", second: "2", third: "3" })[m]);
    s = s.replace(/^st(?=[a-z])/, "");
    return s;
  }
  function findBook(raw) {
    return ABBREV.get(normalizeBookKey(raw));
  }
  function hebrewPsalmToDouay(h) {
    if (h <= 8) return h;
    if (h === 9 || h === 10) return 9;
    if (h <= 113) return h - 1;
    if (h === 114 || h === 115) return 113;
    if (h === 116) return 114;
    if (h <= 146) return h - 1;
    if (h === 147) return 146;
    return h;
  }
  function douayPsalmToHebrew(d) {
    if (d <= 8) return String(d);
    if (d === 9) return "9–10";
    if (d <= 112) return String(d + 1);
    if (d === 113) return "114–115";
    if (d === 114 || d === 115) return "116";
    if (d <= 145) return String(d + 1);
    if (d === 146 || d === 147) return "147";
    return String(d);
  }
  function formatRef(bookName, chapter, vs, ve) {
    let s = `${bookName} ${chapter}`;
    if (vs) s += `:${vs}`;
    if (ve && ve !== vs) s += `-${ve}`;
    return s;
  }
  function referenceLabel(book, chapter, vs, ve) {
    const b = BOOK_BY_CODE[book];
    const name = book === "PSA" ? "Psalm" : b ? b.name : book;
    const ch = book === "PSA" ? douayPsalmToHebrew(chapter) : String(chapter);
    return formatRef(name, ch, vs, ve);
  }

  // ---------------------------------------------------------------------------------------------
  // Catechism (lib/ccc.ts)
  // ---------------------------------------------------------------------------------------------
  const HEADINGS = new Map(D.headings.map((h) => [h[0], { id: h[0], level: h[1], parentId: h[2], label: h[3], title: h[4], first: h[5], last: h[6] }]));
  const PARA = new Map();
  for (const p of D.ccc) PARA.set(p[0], { n: p[0], text: p[1], headingId: p[2], prologue: p[3] });

  function headingCrumbs(id) {
    const out = [];
    let cur = HEADINGS.get(id);
    while (cur) {
      out.unshift({ level: cur.level, label: cur.label, title: cur.title });
      cur = cur.parentId ? HEADINGS.get(cur.parentId) : null;
    }
    return out;
  }
  function getHeading(id) {
    const h = HEADINGS.get(id);
    return h ? { ...h, breadcrumb: headingCrumbs(id) } : null;
  }
  function paragraph(n, withNotes = true) {
    const p = PARA.get(n);
    if (!p) return null;
    const footnotes = withNotes ? (D.footnotes[n] || []).map((f) => ({ num: f[0], text: f[1] })) : [];
    const scriptureRefs = withNotes
      ? (D.refs[n] || []).map((r) => {
          const b = BOOK_BY_CODE[r[0]];
          return { book: r[0], bookName: b ? b.name : r[0], chapter: r[1], verseStart: r[2], verseEnd: r[3], drChapter: r[4], reference: formatRef(b ? b.name : r[0], r[1], r[2], r[3]) };
        })
      : [];
    const breadcrumb = p.headingId ? headingCrumbs(p.headingId) : [{ level: "part", label: "Prologue", title: p.prologue || "" }];
    return { n, text: p.text, breadcrumb, headingId: p.headingId, footnotes, scriptureRefs };
  }
  /** Paragraph n with its neighbours, clipped to the article that contains it. */
  function getContext(n, before, after) {
    const p = PARA.get(n);
    if (!p) return { paragraphs: [], unit: null };
    const unit = p.headingId ? getHeading(p.headingId) : null;
    const lo = Math.max(unit ? unit.first : 1, n - before);
    const hi = Math.min(unit ? unit.last : MAX_N, n + after);
    const paragraphs = [];
    for (let k = lo; k <= hi; k++) {
      const q = paragraph(k);
      if (q) paragraphs.push(q);
    }
    return { paragraphs, unit };
  }
  function getRelated(n, limit = 8) {
    return (D.related[n] || []).slice(0, limit);
  }

  // ---------------------------------------------------------------------------------------------
  // Bible (lib/bible.ts)
  // ---------------------------------------------------------------------------------------------
  const PASSAGES = new Map();
  const PASSAGES_BY_CHAPTER = new Map();
  for (const p of D.passages) {
    const o = { id: p[0], book: p[1], chapter: p[2], verseStart: p[3], verseEnd: p[4] };
    PASSAGES.set(o.id, o);
    const key = `${o.book}:${o.chapter}`;
    if (!PASSAGES_BY_CHAPTER.has(key)) PASSAGES_BY_CHAPTER.set(key, []);
    PASSAGES_BY_CHAPTER.get(key).push(o);
  }
  function chapterVerses(book, chapter) {
    return (D.verses[book] || {})[chapter] || [];
  }
  function passageVerses(p) {
    return chapterVerses(p.book, p.chapter)
      .filter((v) => v[0] >= p.verseStart && v[0] <= p.verseEnd)
      .map((v) => ({ verse: v[0], text: v[1], notes: v[2] || [] }));
  }
  function passage(id) {
    const p = PASSAGES.get(id);
    if (!p) return null;
    const b = BOOK_BY_CODE[p.book];
    return {
      id,
      book: p.book,
      bookName: b ? b.name : p.book,
      drBookName: b ? b.drName : p.book,
      chapter: p.chapter,
      modernChapter: p.book === "PSA" ? douayPsalmToHebrew(p.chapter) : String(p.chapter),
      verseStart: p.verseStart,
      verseEnd: p.verseEnd,
      reference: referenceLabel(p.book, p.chapter, p.verseStart, p.verseEnd),
      verses: passageVerses(p),
    };
  }
  /** Passages overlapping a verse range (Douay-Rheims chapter numbering). */
  function findPassagesForRange(book, drChapter, verseStart, verseEnd) {
    const list = PASSAGES_BY_CHAPTER.get(`${book}:${drChapter}`) || [];
    if (!verseStart) return list.slice(0, 3).map((p) => p.id);
    const end = verseEnd || verseStart;
    return list.filter((p) => p.verseEnd >= verseStart && p.verseStart <= end).map((p) => p.id);
  }
  function resolveReference(ref) {
    const m = ref.trim().match(/^((?:[1-3]\s?)?[A-Za-z]+(?:\s(?:of\s)?[A-Za-z]+)*)\.?\s+(\d{1,3})(?::(\d{1,3})(?:-(\d{1,3}))?)?$/);
    if (!m) return [];
    const book = findBook(m[1]);
    if (!book) return [];
    const chapter = Number(m[2]);
    const drChapter = book.code === "PSA" ? hebrewPsalmToDouay(chapter) : chapter;
    return findPassagesForRange(book.code, drChapter, m[3] ? Number(m[3]) : null, m[4] ? Number(m[4]) : null);
  }
  function getChapter(book, chapter) {
    const b = BOOK_BY_CODE[book];
    if (!b) return null;
    const meta = (D.chapters[book] || {})[chapter];
    if (!meta) return null;
    return {
      book,
      bookName: b.name,
      drBookName: b.drName,
      chapter,
      modernChapter: book === "PSA" ? douayPsalmToHebrew(chapter) : String(chapter),
      chapters: b.chapters,
      summary: meta[0],
      psalmTitle: meta[1],
      verses: chapterVerses(book, chapter).map((v) => ({ verse: v[0], text: v[1], notes: v[2] || [] })),
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Keyword index: FTS5 'porter unicode61' tokenizer and bm25() reimplemented
  // ---------------------------------------------------------------------------------------------
  function fold(s) {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }
  const stemCache = new Map();
  function stem(w) {
    let s = stemCache.get(w);
    if (s === undefined) {
      s = /^[a-z]+$/.test(w) ? porter(w) : w;
      stemCache.set(w, s);
    }
    return s;
  }
  function tokenize(text) {
    const out = [];
    for (const w of fold(text).split(/[^\p{L}\p{N}]+/u)) if (w) out.push(stem(w));
    return out;
  }

  // Porter stemmer (1980 algorithm with the bli/logi revisions, as in SQLite's porter tokenizer).
  const porter = (function () {
    const step2list = { ational: "ate", tional: "tion", enci: "ence", anci: "ance", izer: "ize", bli: "ble", alli: "al", entli: "ent", eli: "e", ousli: "ous", ization: "ize", ation: "ate", ator: "ate", alism: "al", iveness: "ive", fulness: "ful", ousness: "ous", aliti: "al", iviti: "ive", biliti: "ble", logi: "log" };
    const step3list = { icate: "ic", ative: "", alize: "al", iciti: "ic", ical: "ic", ful: "", ness: "" };
    const c = "[^aeiou]";
    const v = "[aeiouy]";
    const C = c + "[^aeiouy]*";
    const V = v + "[aeiou]*";
    const mgr0 = "^(" + C + ")?" + V + C;
    const meq1 = "^(" + C + ")?" + V + C + "(" + V + ")?$";
    const mgr1 = "^(" + C + ")?" + V + C + V + C;
    const s_v = "^(" + C + ")?" + v;
    return function (w) {
      if (w.length < 3) return w;
      let stem, suffix, re, re2, re3, re4;
      const firstch = w.substr(0, 1);
      if (firstch === "y") w = firstch.toUpperCase() + w.substr(1);
      // Step 1a
      re = /^(.+?)(ss|i)es$/;
      re2 = /^(.+?)([^s])s$/;
      if (re.test(w)) w = w.replace(re, "$1$2");
      else if (re2.test(w)) w = w.replace(re2, "$1$2");
      // Step 1b
      re = /^(.+?)eed$/;
      re2 = /^(.+?)(ed|ing)$/;
      if (re.test(w)) {
        const fp = re.exec(w);
        re = new RegExp(mgr0);
        if (re.test(fp[1])) w = w.replace(/.$/, "");
      } else if (re2.test(w)) {
        const fp = re2.exec(w);
        stem = fp[1];
        re2 = new RegExp(s_v);
        if (re2.test(stem)) {
          w = stem;
          re2 = /(at|bl|iz)$/;
          re3 = new RegExp("([^aeiouylsz])\\1$");
          re4 = new RegExp("^" + C + v + "[^aeiouwxy]$");
          if (re2.test(w)) w = w + "e";
          else if (re3.test(w)) w = w.replace(/.$/, "");
          else if (re4.test(w)) w = w + "e";
        }
      }
      // Step 1c
      re = /^(.+?)y$/;
      if (re.test(w)) {
        const fp = re.exec(w);
        stem = fp[1];
        re = new RegExp(s_v);
        if (re.test(stem)) w = stem + "i";
      }
      // Step 2
      re = /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/;
      if (re.test(w)) {
        const fp = re.exec(w);
        stem = fp[1];
        suffix = fp[2];
        re = new RegExp(mgr0);
        if (re.test(stem)) w = stem + step2list[suffix];
      }
      // Step 3
      re = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/;
      if (re.test(w)) {
        const fp = re.exec(w);
        stem = fp[1];
        suffix = fp[2];
        re = new RegExp(mgr0);
        if (re.test(stem)) w = stem + step3list[suffix];
      }
      // Step 4
      re = /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/;
      re2 = /^(.+?)(s|t)(ion)$/;
      if (re.test(w)) {
        const fp = re.exec(w);
        stem = fp[1];
        re = new RegExp(mgr1);
        if (re.test(stem)) w = stem;
      } else if (re2.test(w)) {
        const fp = re2.exec(w);
        stem = fp[1] + fp[2];
        re2 = new RegExp(mgr1);
        if (re2.test(stem)) w = stem;
      }
      // Step 5
      re = /^(.+?)e$/;
      if (re.test(w)) {
        const fp = re.exec(w);
        stem = fp[1];
        re = new RegExp(mgr1);
        re2 = new RegExp(meq1);
        re3 = new RegExp("^" + C + v + "[^aeiouwxy]$");
        if (re.test(stem) || (re2.test(stem) && !re3.test(stem))) w = stem;
      }
      re = /ll$/;
      re2 = new RegExp(mgr1);
      if (re.test(w) && re2.test(w)) w = w.replace(/.$/, "");
      if (firstch === "y") w = firstch.toLowerCase() + w.substr(1);
      return w;
    };
  })();

  /** docs: [{ id, cols: [text, ...] }] -> inverted index with per-column term frequencies. */
  function buildIndex(docs, ncols) {
    const N = docs.length;
    const postings = new Map(); // stem -> flat [docIdx, tf_col0, tf_col1, ...]
    const dl = new Float64Array(N); // tokens in the whole row, as FTS5's bm25() measures it
    const ids = new Array(N);
    const tfs = new Map();
    let total = 0;
    for (let i = 0; i < N; i++) {
      ids[i] = docs[i].id;
      tfs.clear();
      for (let c = 0; c < ncols; c++) {
        const toks = tokenize(docs[i].cols[c]);
        dl[i] += toks.length;
        for (const t of toks) {
          let a = tfs.get(t);
          if (!a) {
            a = new Array(ncols).fill(0);
            tfs.set(t, a);
          }
          a[c]++;
        }
      }
      total += dl[i];
      for (const [t, a] of tfs) {
        let p = postings.get(t);
        if (!p) {
          p = [];
          postings.set(t, p);
        }
        p.push(i, ...a);
      }
    }
    return { N, ncols, postings, dl, avgdl: total / N, ids };
  }

  /**
   * FTS5's bm25(fts, w0, w1, ...) over "s1" OR "s2" OR ..., best first (FTS5 returns the negated
   * score). Per phrase, the column weights fold into one frequency, and the row's total token
   * count is the document length. `filter(id)` restricts the rows.
   */
  function bm25(index, stems, weights, limit, filter) {
    const { N, ncols, postings, dl, avgdl, ids } = index;
    const k1 = 1.2;
    const b = 0.75;
    const stride = ncols + 1;
    const scores = new Map();
    for (const s of stems) {
      const p = postings.get(s);
      if (!p) continue;
      const nHit = p.length / stride;
      let idf = Math.log((N - nHit + 0.5) / (nHit + 0.5));
      if (idf <= 0) idf = 1e-6;
      for (let j = 0; j < p.length; j += stride) {
        const i = p[j];
        if (filter && !filter(ids[i])) continue;
        let f = 0;
        for (let c = 0; c < ncols; c++) f += weights[c] * p[j + 1 + c];
        scores.set(i, (scores.get(i) || 0) + idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * dl[i]) / avgdl))));
      }
    }
    return [...scores.entries()]
      .sort((x, y) => y[1] - x[1] || ids[x[0]] - ids[y[0]])
      .slice(0, limit)
      .map(([i, score]) => ({ id: ids[i], score }));
  }

  let cccIndex = null;
  let bibleIndex = null;
  let indexMs = 0;
  function ensureIndex() {
    if (cccIndex) return;
    const t0 = performance.now();
    cccIndex = buildIndex(
      D.ccc.map((p) => ({ id: p[0], cols: [p[1], (p[2] ? headingCrumbs(p[2]) : [{ title: p[3] || "" }]).map((c) => c.title).join(" / ")] })),
      2,
    );
    bibleIndex = buildIndex(
      D.passages.map((p) => {
        const b = BOOK_BY_CODE[p[1]];
        const ref = b ? `${b.name} ${p[2]}${b.name !== b.drName ? " " + b.drName : ""}` : `${p[1]} ${p[2]}`;
        return { id: p[0], cols: [passageVerses({ book: p[1], chapter: p[2], verseStart: p[3], verseEnd: p[4] }).map((v) => v.text).join(" "), ref] };
      }),
      2,
    );
    indexMs = Math.round(performance.now() - t0);
  }

  // ---------------------------------------------------------------------------------------------
  // Search (lib/search.ts without the embedding signal)
  // ---------------------------------------------------------------------------------------------
  const RRF_K = 60;
  const WEIGHTS = {
    keyword: 1.0,
    topic: 1.1,
    topicBoost: 0.006,
    scriptureLink: 0.004,
    norm: 0.004,
    bibleKeyword: 0.9,
    bibleTopic: 1.3,
    catechismCites: 1.2,
  };
  const IN_TOPIC_CANDIDATES = 8;
  const NORM_QUERY_WORDS = new Set(["sin", "sinful", "allowed", "permitted", "forbidden", "obligation"]);
  const NORM_TEXT_MARKERS = ["grave sin", "gravely", "obligation", "forbids", "permitted"];
  const STOPWORDS = new Set(
    `a an and are as at be been but by can could did do does for from had has have how i if in into is it its
     me my of on or our should so that the their them then there these they this to us was we were what when where
     which who whom why will with would you your about say says said teach teaches teaching teachings church
     catholic catholics bible scripture position view believe believes think regarding concerning does really
     actually ever always any some something someone`.split(/\s+/),
  );

  function queryTokens(query) {
    const seen = new Set();
    const out = [];
    for (const raw of query.toLowerCase().split(/[^a-z0-9']+/)) {
      const t = raw.replace(/'/g, "");
      if (t.length < 2 || STOPWORDS.has(t) || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }
  function topicRankWeight(base, i) {
    return base / (1 + 0.5 * i);
  }
  function normalizeForMatch(s) {
    return " " + s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
  }
  /** Naive singular/plural + inflection folding so "horoscopes" matches the keyword "horoscope". */
  function stemWord(w) {
    if (w.length <= 3) return w;
    return w
      .replace(/(ies)$/, "y")
      .replace(/(sses|shes|ches|xes)$/, (m) => m.slice(0, -2))
      .replace(/s$/, "")
      .replace(/(ing|ed)$/, "")
      .replace(/e$/, "");
  }
  function stemPhrase(s) {
    return " " + s.trim().split(/\s+/).map(stemWord).join(" ") + " ";
  }
  function matchTopics(query, limit = 3) {
    const q = normalizeForMatch(query);
    const qStem = stemPhrase(q);
    const matches = [];
    for (const t of D.topics) {
      const matched = [];
      let score = 0;
      for (const kw of t.keywords) {
        const k = normalizeForMatch(kw);
        if (q.includes(k) || qStem.includes(stemPhrase(k))) {
          matched.push(kw);
          score += k.trim().split(" ").length * 2 + 1;
        }
      }
      if (matched.length) matches.push({ ...t, matchedKeywords: matched, score });
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  class Fuser {
    constructor() {
      this.scores = new Map();
      this.signals = new Map();
    }
    addList(ids, signal, weight) {
      ids.forEach((id, rank) => this.add(id, signal, weight / (RRF_K + rank + 1)));
    }
    add(id, signal, delta) {
      this.scores.set(id, (this.scores.get(id) || 0) + delta);
      if (!this.signals.has(id)) this.signals.set(id, new Set());
      this.signals.get(id).add(signal);
    }
    top(n) {
      return [...this.scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([id, score]) => ({ id, score, signals: [...(this.signals.get(id) || [])] }));
    }
  }
  function inRanges(n, ranges) {
    return ranges.some(([a, b]) => n >= a && n <= b);
  }
  const normCache = new Map();
  function normMarkers(n) {
    let m = normCache.get(n);
    if (m === undefined) {
      const text = PARA.get(n).text.toLowerCase();
      m = NORM_TEXT_MARKERS.filter((k) => text.includes(k)).length;
      normCache.set(n, m);
    }
    return m;
  }

  function search(rawQuery, options = {}) {
    ensureIndex();
    const query = rawQuery.trim().replace(/\s+/g, " ");
    const cccLimit = options.cccLimit || 10;
    const bibleLimit = options.bibleLimit || 8;
    const K = options.candidates || 60;
    const t1 = performance.now();
    const tokens = queryTokens(query);
    const stems = [...new Set(tokens.map(stem))];
    const topics = matchTopics(query);

    // ---------------- Catechism ----------------
    const ccc = new Fuser();
    if (stems.length) ccc.addList(bm25(cccIndex, stems, [3, 1], K).map((r) => r.id), "keyword", WEIGHTS.keyword);
    topics.forEach((topic, ti) => {
      // The server ranks each topic's paragraphs by embedding similarity, then adds the keyword
      // matches inside the ranges. Without embeddings: every keyword match inside the topic's
      // ranges, best first, then, when the topic's first range (its primary pointer; later short
      // ranges are cross-references) is short, that range's paragraphs, so a precise pointer such
      // as "cremation -> 2300-2301" still surfaces paragraphs the question's words do not name.
      const list = stems.length ? bm25(cccIndex, stems, [3, 1], IN_TOPIC_CANDIDATES + 4, (n) => inRanges(n, topic.ranges)).map((r) => r.id) : [];
      const [a, b] = topic.ranges[0];
      if (b - a + 1 <= IN_TOPIC_CANDIDATES) for (let n = a; n <= b; n++) if (!list.includes(n)) list.push(n);
      ccc.addList(list, "topic", topicRankWeight(WEIGHTS.topic, ti));
      for (const id of ccc.scores.keys()) if (inRanges(id, topic.ranges)) ccc.add(id, "topic", topicRankWeight(WEIGHTS.topicBoost, ti));
    });
    if (tokens.some((t) => NORM_QUERY_WORDS.has(t))) {
      for (const id of [...ccc.scores.keys()]) {
        const m = normMarkers(id);
        if (m) ccc.add(id, "norm", WEIGHTS.norm * Math.min(m, 2));
      }
    }

    // ---------------- Bible ----------------
    const bible = new Fuser();
    if (stems.length) bible.addList(bm25(bibleIndex, stems, [1, 0.5], K).map((r) => r.id), "keyword", WEIGHTS.bibleKeyword);
    topics.forEach((topic, ti) => {
      const ids = [];
      for (const ref of topic.scripture) for (const id of resolveReference(ref).slice(0, 2)) if (!ids.includes(id)) ids.push(id);
      bible.addList(ids, "topic", topicRankWeight(WEIGHTS.bibleTopic, ti));
    });

    // Cross-links: passages cited by the top Catechism hits, and paragraphs citing retrieved passages.
    const cccTop = ccc.top(cccLimit);
    const citedBy = new Map();
    const citedIds = [];
    for (const hit of cccTop) {
      for (const r of D.refs[hit.id] || []) {
        for (const id of findPassagesForRange(r[0], r[4], r[2], r[3]).slice(0, 2)) {
          if (!citedBy.has(id)) citedBy.set(id, new Set());
          citedBy.get(id).add(hit.id);
          if (!citedIds.includes(id)) citedIds.push(id);
        }
      }
    }
    citedIds.sort((a, b) => (citedBy.get(b) ? citedBy.get(b).size : 0) - (citedBy.get(a) ? citedBy.get(a).size : 0));
    bible.addList(citedIds, "catechism-cites", WEIGHTS.catechismCites);
    for (const id of citedIds) {
      if (bible.signals.get(id).size > 1) for (const n of citedBy.get(id)) ccc.add(n, "scripture-link", WEIGHTS.scriptureLink);
    }

    // ---------------- hydrate + group ----------------
    const cccHits = ccc.top(cccLimit);
    const cccGroups = new Map();
    for (const hit of cccHits) {
      const p = paragraph(hit.id);
      if (!p) continue;
      const key = String(p.headingId != null ? p.headingId : `prologue-${p.breadcrumb[0] && p.breadcrumb[0].title}`);
      if (!cccGroups.has(key)) {
        const h = p.headingId ? HEADINGS.get(p.headingId) : null;
        cccGroups.set(key, { headingId: p.headingId, breadcrumb: p.breadcrumb, range: h ? [h.first, h.last] : null, score: hit.score, hits: [] });
      }
      const g = cccGroups.get(key);
      g.score = Math.max(g.score, hit.score);
      g.hits.push({ ...p, score: hit.score, signals: hit.signals });
    }
    const churchTeaching = [...cccGroups.values()].sort((a, b) => b.score - a.score);
    for (const g of churchTeaching) g.hits.sort((a, b) => a.n - b.n);

    const bibleHits = bible.top(bibleLimit);
    const bibleGroups = new Map();
    for (const hit of bibleHits) {
      const p = passage(hit.id);
      if (!p) continue;
      const key = `${p.book}:${p.chapter}`;
      if (!bibleGroups.has(key)) {
        const meta = (D.chapters[p.book] || {})[p.chapter];
        bibleGroups.set(key, { book: p.book, bookName: p.bookName, chapter: p.chapter, modernChapter: p.modernChapter, summary: meta ? meta[0] : null, score: hit.score, hits: [] });
      }
      const g = bibleGroups.get(key);
      g.score = Math.max(g.score, hit.score);
      g.hits.push({ ...p, score: hit.score, signals: hit.signals, citedBy: [...(citedBy.get(hit.id) || [])].sort((a, b) => a - b) });
    }
    const scripture = [...bibleGroups.values()].sort((a, b) => b.score - a.score);
    for (const g of scripture) g.hits.sort((a, b) => a.verseStart - b.verseStart);

    return {
      query,
      topics: topics.map((t) => ({ slug: t.slug, name: t.name, category: t.category, description: t.description, ranges: t.ranges, matchedKeywords: t.matchedKeywords })),
      churchTeaching,
      scripture,
      timings: { searchMs: Math.round(performance.now() - t1) },
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Browser-only state: search history and missed questions (localStorage)
  // ---------------------------------------------------------------------------------------------
  function readList(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed.filter((e) => typeof e.query === "string") : [];
    } catch {
      return [];
    }
  }
  function writeList(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch {
      // storage unavailable (private mode, quota): a convenience only
    }
  }
  const HISTORY_KEY = "cc-history";
  const MISSED_KEY = "cc-missed";
  const getHistory = () => readList(HISTORY_KEY);
  function pushHistory(query) {
    const q = query.trim();
    writeList(HISTORY_KEY, [{ query: q, at: Date.now() }, ...getHistory().filter((e) => e.query.toLowerCase() !== q.toLowerCase())].slice(0, 20));
  }
  const clearHistory = () => writeList(HISTORY_KEY, []);
  const getMissed = () => readList(MISSED_KEY);
  const isMissed = (query) => getMissed().some((e) => e.query.toLowerCase() === query.trim().toLowerCase());
  function addMissed(query) {
    const q = query.trim();
    if (!q) return;
    writeList(MISSED_KEY, [{ query: q, at: Date.now() }, ...getMissed().filter((e) => e.query.toLowerCase() !== q.toLowerCase())].slice(0, 200));
  }
  const removeMissed = (query) => writeList(MISSED_KEY, getMissed().filter((e) => e.query !== query));
  const clearMissed = () => writeList(MISSED_KEY, []);

  // ---------------------------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------------------------
  const EXAMPLES = [
    "What does the Church teach about IVF?",
    "Is it a sin to skip Mass?",
    "Where does the Bible talk about forgiveness?",
    "What is purgatory?",
    "Do I have to follow my conscience even if it is wrong?",
    "What are the conditions for a just war?",
  ];
  const SIGNAL_LABEL = { keyword: "keyword", topic: "topic index", "scripture-link": "cites a matching passage", norm: "states the rule", "catechism-cites": "cited by the Catechism" };
  const main = document.getElementById("main");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const cccHref = (n) => `#/ccc/${n}`;
  const bibleHref = (book, drChapter, verse) => `#/bible/${book}/${drChapter}${verse ? `/${verse}` : ""}`;
  const searchHref = (q) => `#/?q=${encodeURIComponent(q)}`;
  const truncate = (text, max = 200) => {
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trimEnd() + "…";
  };
  const state = { query: "", result: null, cards: new Map() };

  function crumbsHtml(crumbs) {
    return `<ol class="crumbs">${crumbs.map((c, i) => `<li>${i > 0 ? '<span aria-hidden="true">›</span>' : ""}<span><span class="lbl">${esc(c.label)}</span><span class="ttl"> ${esc(c.title)}</span></span></li>`).join("")}</ol>`;
  }
  function citesHtml(refs) {
    if (!refs.length) return "";
    const seen = new Set();
    const uniq = refs.filter((r) => (seen.has(r.reference) ? false : (seen.add(r.reference), true)));
    return `<p class="cites"><span class="k">Cites</span>${uniq.map((r) => `<a href="${bibleHref(r.book, r.drChapter, r.verseStart)}" class="link">${esc(r.reference)}</a>`).join("; ")}</p>`;
  }
  function searchBoxHtml(value, compact) {
    return `<form class="search ${compact ? "compact" : ""}" role="search" id="search-form">
      <label for="q" class="sr-only">Ask what the Church teaches</label>
      <div class="search-field">
        <input id="q" name="q" type="search" value="${esc(value)}" placeholder="What does the Church teach about…" autocomplete="off" spellcheck="false" enterkeyhint="search">
        <button type="submit" class="search-submit" ${value.trim() ? "" : "disabled"}>Search ↵</button>
        <span aria-hidden="true" class="search-underline"></span>
      </div>
    </form>`;
  }

  function paragraphCardHtml(hit) {
    const st = state.cards.get(`c${hit.n}`) || {};
    const ctx = st.context ? getContext(hit.n, 3, 3).paragraphs : null;
    return `<article id="ccc-${hit.n}" class="card" data-card="c${hit.n}">
      <div class="card-head"><a href="${cccHref(hit.n)}" class="tag">CCC ${hit.n}</a><span class="signals">${hit.signals.map((s) => SIGNAL_LABEL[s] || s).join(" · ")}</span></div>
      ${
        ctx
          ? `<div class="context">${ctx.map((p) => `<div class="${p.n === hit.n ? "highlight" : ""}"><span class="pn">${p.n}</span><span class="prose-text">${esc(p.text)}</span></div>`).join("")}</div>`
          : `<p class="prose-text">${esc(hit.text)}</p>`
      }
      ${citesHtml(hit.scriptureRefs)}
      <div class="card-actions">
        <button type="button" class="link" data-act="context" aria-expanded="${!!st.context}">${st.context ? "Hide surrounding paragraphs" : "Read surrounding paragraphs"}</button>
        ${hit.footnotes.length ? `<button type="button" class="quiet" data-act="notes" aria-expanded="${!!st.notes}">${st.notes ? "Hide notes" : `Notes (${hit.footnotes.length})`}</button>` : ""}
        <a href="${cccHref(hit.n)}" class="quiet">Full article →</a>
      </div>
      ${st.notes ? `<ol class="notes">${hit.footnotes.map((f) => `<li><span class="num">${f.num}</span>${esc(f.text)}</li>`).join("")}</ol>` : ""}
    </article>`;
  }
  function passageCardHtml(hit) {
    const st = state.cards.get(`b${hit.id}`) || {};
    const notes = hit.verses.flatMap((v) => v.notes.map((n) => ({ verse: v.verse, text: n })));
    return `<article class="card" data-card="b${hit.id}">
      <div class="card-head"><a href="${bibleHref(hit.book, hit.chapter, hit.verseStart)}" class="tag">${esc(hit.reference)}</a><span class="signals">${hit.signals.map((s) => SIGNAL_LABEL[s] || s).join(" · ")}</span></div>
      <p class="prose-text">${hit.verses.map((v) => `<span><span class="verse-num">${v.verse}</span>${esc(v.text)} </span>`).join("")}</p>
      <div class="card-actions">
        <a href="${bibleHref(hit.book, hit.chapter, hit.verseStart)}" class="link">Read the full chapter</a>
        ${notes.length ? `<button type="button" class="quiet" data-act="notes" aria-expanded="${!!st.notes}">${st.notes ? "Hide notes" : `Challoner's notes (${notes.length})`}</button>` : ""}
        ${hit.citedBy.length ? `<span class="quiet">Cited in ${hit.citedBy.map((n) => `<a href="#ccc-${n}" class="link">CCC ${n}</a>`).join(", ")}</span>` : ""}
      </div>
      ${st.notes ? `<ul class="notes">${notes.map((n) => `<li><span class="num">v. ${n.verse}</span>${esc(n.text)}</li>`).join("")}</ul>` : ""}
    </article>`;
  }
  function resultsHtml(result) {
    const cccCount = result.churchTeaching.reduce((n, g) => n + g.hits.length, 0);
    const bibleCount = result.scripture.reduce((n, g) => n + g.hits.length, 0);
    const missed = isMissed(result.query);
    return `<section class="results">
      ${result.topics.length ? `<div class="topic-chips"><span class="eyebrow">Topics</span>${result.topics.map((t) => `<a href="#/topics/${esc(t.slug)}" class="link" title="${esc(t.description)}">${esc(t.name)}</a>`).join("")}</div>` : ""}
      <div class="panels">
        <div class="panel-ccc">
          <div class="panel-head"><h2>Church teaching</h2><span>${cccCount} paragraph${cccCount === 1 ? "" : "s"} · Catechism of the Catholic Church</span></div>
          ${result.churchTeaching.length ? "" : '<p class="empty">No Catechism paragraphs matched this question closely enough.</p>'}
          <div class="groups">${result.churchTeaching
            .map(
              (g) => `<section>
              ${crumbsHtml(g.breadcrumb.slice(0, -1))}
              <div class="group-head"><h3>${esc((g.breadcrumb[g.breadcrumb.length - 1] || {}).title || "")}</h3>${g.range ? `<a href="${cccHref(g.hits[0].n)}">¶${g.range[0]}–${g.range[1]} · open article →</a>` : ""}</div>
              <div class="cards">${g.hits.map(paragraphCardHtml).join("")}</div>
            </section>`,
            )
            .join("")}</div>
        </div>
        <div class="panel-bible">
          <div class="panel-head"><h2>Scripture</h2><span>${bibleCount} passage${bibleCount === 1 ? "" : "s"} · Douay-Rheims</span></div>
          ${result.scripture.length ? "" : '<p class="empty">No passages matched closely enough.</p>'}
          <div class="groups groups-bible">${result.scripture
            .map(
              (g) => `<section>
              <div class="bible-group-head"><h3>${esc(g.book === "PSA" ? "Psalm" : g.bookName)} ${esc(g.modernChapter)}${g.book === "PSA" && g.modernChapter !== String(g.chapter) ? `<span class="alt">(Douay-Rheims Psalm ${g.chapter})</span>` : ""}</h3>${g.summary ? `<p class="summary">${esc(g.summary)}</p>` : ""}</div>
              <div class="cards cards-bible">${g.hits.map(passageCardHtml).join("")}</div>
            </section>`,
            )
            .join("")}</div>
        </div>
      </div>
      <div class="result-foot">
        <p id="missed-link">${missed ? `Saved to your <a href="#/missed" class="link">missed questions</a>. <button type="button" class="quiet" data-act="unmiss">Undo</button>` : `<button type="button" class="link" data-act="miss">I couldn't find what I was looking for</button>`}</p>
        <p>Ranked in this browser by keyword match, the topic index and the Catechism's own citations · ${result.timings.searchMs} ms${indexMs ? ` (index built in ${indexMs} ms)` : ""}</p>
      </div>
    </section>`;
  }

  function renderHome(q) {
    document.title = q ? `${q} · Catechism Compass` : "Catechism Compass — what the Church teaches, with sources";
    let result = null;
    let error = null;
    if (q) {
      try {
        result = search(q);
        pushHistory(q);
      } catch (e) {
        error = "Search failed: " + e.message;
        console.error(e);
      }
    }
    state.query = q;
    state.result = result;
    state.cards = new Map();
    const has = !!result;
    const history = getHistory();
    const byCategory = new Map();
    for (const t of D.topics) {
      if (!byCategory.has(t.category)) byCategory.set(t.category, []);
      byCategory.get(t.category).push(t);
    }
    main.innerHTML = `<div class="home ${has ? "has-results" : ""}">
      <section class="hero">
        ${has ? "" : `<div class="hero-text"><p class="eyebrow">Catechism · Scripture · Sources</p><h1 class="title">What does the Church teach?</h1><p class="lede">Ask in plain language. You get the relevant paragraphs of the Catechism and the passages of Scripture they rest on, in full, with their references.</p></div>`}
        ${searchBoxHtml(q, has)}
        ${error ? `<p class="status" role="alert">${esc(error)}</p>` : ""}
      </section>
      ${
        has
          ? resultsHtml(result)
          : `<section class="examples">
        <div class="two-col">
          <div><p class="eyebrow" style="margin-bottom:.75rem">Try asking</p><ul class="ex-list">${EXAMPLES.map((ex) => `<li><button type="button" class="link" data-q="${esc(ex)}">${esc(ex)}</button></li>`).join("")}</ul></div>
          <div>
            <div class="row-between"><p class="eyebrow">Recent</p>${history.length ? '<button type="button" class="small-btn" data-act="clear-history">Clear</button>' : ""}</div>
            ${history.length ? `<ul class="ex-list">${history.slice(0, 8).map((h) => `<li><button type="button" class="link" data-q="${esc(h.query)}">${esc(h.query)}</button></li>`).join("")}</ul>` : '<p class="muted">Your searches are kept in this browser only. Nothing is stored on a server.</p>'}
          </div>
        </div>
        <div class="browse">
          <div class="row-between"><p class="eyebrow">Browse by topic</p><a href="#/topics" class="small-btn">All topics →</a></div>
          <div class="topic-grid">${[...byCategory.entries()].map(([cat, list]) => `<div><p class="cat">${esc(cat)}</p><ul>${list.map((t) => `<li><button type="button" data-q="${esc(t.name)}">${esc(t.name)}</button></li>`).join("")}</ul></div>`).join("")}</div>
        </div>
      </section>`
      }
    </div>`;
    const input = document.getElementById("q");
    if (!q) input.focus();
    input.addEventListener("input", () => {
      document.querySelector(".search-submit").disabled = !input.value.trim();
    });
  }

  function renderArticle(n) {
    if (!Number.isInteger(n) || n < 1 || n > MAX_N) return renderNotFound();
    const target = paragraph(n);
    if (!target) return renderNotFound();
    document.title = `CCC ${n} · Catechism Compass`;
    const unit = target.headingId ? getHeading(target.headingId) : null;
    const first = unit ? unit.first : Math.max(1, n - 5);
    const last = unit ? unit.last : Math.min(MAX_N, n + 5);
    const related = getRelated(n, 6).filter((r) => r < first || r > last);
    const items = [];
    for (let k = first; k <= last; k++) {
      const p = paragraph(k);
      if (!p) continue;
      items.push(`<article id="p${k}" class="${k === n ? "highlight" : ""}">
        <div class="card-head"><a href="#p${k}" class="tag">CCC ${k}</a></div>
        <p class="prose-text">${esc(p.text)}</p>
        ${citesHtml(p.scriptureRefs)}
        ${p.footnotes.length ? `<details class="notes-d"><summary>Notes (${p.footnotes.length})</summary><ol>${p.footnotes.map((f) => `<li><span class="num mono quiet">${f.num}</span> ${esc(f.text)}</li>`).join("")}</ol></details>` : ""}
      </article>`);
    }
    main.innerHTML = `<div class="reader">
      <p class="back"><a href="#/">← Search</a></p>
      ${
        unit
          ? `${crumbsHtml(unit.breadcrumb.slice(0, -1))}<h1 class="reader-title"><span class="lbl">${esc(unit.label)}</span>${esc(unit.title)}</h1><p class="reader-meta">Paragraphs ${unit.first}–${unit.last} · Catechism of the Catholic Church</p>`
          : `<h1 class="reader-title">${esc(target.breadcrumb[0].label)}: ${esc(target.breadcrumb[0].title)}</h1>`
      }
      <div class="reader-body">${items.join("")}</div>
      <nav class="reader-nav">${first > 1 ? `<a href="${cccHref(first - 1)}" class="link">← Previous article</a>` : "<span></span>"}${last < MAX_N ? `<a href="${cccHref(last + 1)}" class="link">Next article →</a>` : "<span></span>"}</nav>
      ${
        related.length
          ? `<section class="reader-sec"><span class="eyebrow">Related paragraphs</span><ul class="related">${related
              .map((r) => paragraph(r, false))
              .filter(Boolean)
              .map((p) => `<li><a href="${cccHref(p.n)}" class="tag">CCC ${p.n}</a>${esc(truncate(p.text, 200))}</li>`)
              .join("")}</ul><p class="reader-note">Grouped together by the Compendium of the Catechism.</p></section>`
          : ""
      }
    </div>`;
    const el = document.getElementById(`p${n}`);
    if (el && n !== first) el.scrollIntoView();
  }

  function renderChapter(book, chapter, verse) {
    const b = findBook(book || "");
    if (!b || !Number.isInteger(chapter) || chapter < 1) return renderNotFound();
    const data = getChapter(b.code, chapter);
    if (!data) return renderNotFound();
    document.title = `${data.bookName} ${chapter} · Catechism Compass`;
    const label = data.book === "PSA" ? "Psalm" : "Chapter";
    const notes = data.verses.flatMap((v) => v.notes.map((text) => ({ verse: v.verse, text })));
    main.innerHTML = `<div class="reader">
      <p class="back"><a href="#/">← Search</a></p>
      <p class="eyebrow">${esc(data.bookName)}${data.drBookName !== data.bookName ? `<span style="text-transform:none;letter-spacing:normal"> · Douay-Rheims: ${esc(data.drBookName)}</span>` : ""}</p>
      <h1 class="reader-title" style="margin-top:.5rem">${esc(data.book === "PSA" ? "Psalm" : data.bookName)} ${esc(data.modernChapter)}${data.book === "PSA" && data.modernChapter !== String(data.chapter) ? `<span class="sub">Douay-Rheims Psalm ${data.chapter}</span>` : ""}</h1>
      ${data.psalmTitle ? `<p class="psalm-title">${esc(data.psalmTitle)}</p>` : ""}
      ${data.summary ? `<p class="chapter-summary">${esc(data.summary)}</p>` : ""}
      <div class="reader-body"><p class="prose-text">${data.verses.map((v) => `<span id="v${v.verse}" class="verse ${verse === v.verse ? "target" : ""}"><a href="${bibleHref(data.book, chapter, v.verse)}" class="verse-num anchor">${v.verse}</a>${esc(v.text)} </span>`).join("")}</p></div>
      <nav class="reader-nav">${chapter > 1 ? `<a href="${bibleHref(data.book, chapter - 1)}" class="link">← ${label} ${chapter - 1}</a>` : "<span></span>"}${chapter < data.chapters ? `<a href="${bibleHref(data.book, chapter + 1)}" class="link">${label} ${chapter + 1} →</a>` : "<span></span>"}</nav>
      ${notes.length ? `<section class="reader-sec"><span class="eyebrow">Challoner's notes</span><ol class="chapter-notes">${notes.map((n) => `<li><a href="${bibleHref(data.book, chapter, n.verse)}" class="vn">v. ${n.verse}</a>${esc(n.text)}</li>`).join("")}</ol></section>` : ""}
      <p class="reader-note" style="margin-top:3rem">Douay-Rheims Bible, Challoner revision (public domain). Chapter and verse numbers follow the Douay-Rheims; Psalms are labelled with the modern (Hebrew) number, with the Douay-Rheims number alongside.</p>
    </div>`;
    if (verse) {
      const el = document.getElementById(`v${verse}`);
      if (el) el.scrollIntoView();
    }
  }

  function renderTopics(slug) {
    document.title = "Topics · Catechism Compass";
    const byCategory = new Map();
    for (const t of D.topics) {
      if (!byCategory.has(t.category)) byCategory.set(t.category, []);
      byCategory.get(t.category).push(t);
    }
    main.innerHTML = `<div class="reader">
      <p class="eyebrow" style="margin-bottom:.75rem">Topic index</p>
      <h1 class="reader-title">Common questions, mapped to the Catechism</h1>
      <p class="reader-lede">A small, hand-curated index. Each topic points to the paragraph ranges where the Catechism treats it, so common questions land on the right text even when a search is phrased loosely. Open a topic to search it, or jump straight to the paragraphs.</p>
      <div class="topics-page">${[...byCategory.entries()]
        .map(
          ([cat, list]) => `<section><h2>${esc(cat)}</h2><ul>${list
            .map(
              (t) => `<li id="topic-${esc(t.slug)}"><a href="${searchHref(t.name)}" class="link name">${esc(t.name)}</a><p class="desc">${esc(t.description)}</p><p class="ranges">${t.ranges.map(([a, b]) => `<a href="${cccHref(a)}" class="tag">CCC ${a === b ? a : `${a}–${b}`}</a>`).join("")}</p></li>`,
            )
            .join("")}</ul></section>`,
        )
        .join("")}</div>
    </div>`;
    if (slug) {
      const el = document.getElementById(`topic-${slug}`);
      if (el) el.scrollIntoView();
    }
  }

  function renderAbout() {
    document.title = "About · Catechism Compass";
    main.innerHTML = `<div class="reader reader-narrow">
      <p class="eyebrow" style="margin-bottom:.75rem">About</p>
      <h1 class="reader-title">A reference tool, not an answer engine</h1>
      <div class="about">
        <p>Catechism Compass helps you find what the Church teaches on a moral or doctrinal question by returning the actual text of the <em>Catechism of the Catholic Church</em> and of Scripture, with their references, so you can read the sources yourself. Nothing here is generated: every result is a paragraph of the Catechism or a passage of the Bible.</p>
        <p>This is the single-file edition. Both texts are embedded in this page and results are ranked in your browser by two local signals: keyword search and a hand-curated topic index that maps common questions to the paragraphs where the Catechism treats them. Passages that the Catechism itself cites in its footnotes are promoted in the Scripture panel. No server or network is used. The full edition adds a third signal, the semantic similarity of a small embedding model.</p>
        <p>The Catechism text is © Libreria Editrice Vaticana / United States Conference of Catholic Bishops and is used here for reference. Scripture is the Douay-Rheims Bible (Challoner revision), which is in the public domain; modern book names and psalm numbers are shown alongside the Douay-Rheims ones.</p>
        <p class="callout">This tool is a reference aid. It is not a substitute for a priest, a spiritual director, or the Magisterium of the Church. For questions about your own situation, talk to your pastor.</p>
        <p class="fine">Your searches are stored only in this browser. <a href="#/" class="link">Back to search</a></p>
        <p class="fine">Built ${esc(D.built)} from ${esc(D.meta.ccc_source || "the Catechism corpus")} and ${esc(D.meta.bible_source || "the Douay-Rheims Bible")}.</p>
      </div>
    </div>`;
  }

  function renderMissed() {
    document.title = "Missed questions · Catechism Compass";
    const missed = getMissed();
    const stub = JSON.stringify(
      missed.map((m, i) => ({ id: `missed-${i + 1}`, question: m.query, expectedCcc: [], expectedBible: [] })),
      null,
      2,
    );
    main.innerHTML = `<div class="reader reader-narrow">
      <p class="eyebrow" style="margin-bottom:.75rem">Missed questions</p>
      <h1 class="reader-title">Questions the search did not answer well</h1>
      <p class="reader-lede">Saved in this browser when you press “I couldn't find what I was looking for” under a result. Turn them into new evaluation cases by adding the expected paragraphs and appending them to <code class="mono" style="font-size:.875rem">data/eval/questions.json</code>.</p>
      ${
        missed.length
          ? `<div class="missed-list">
        <div class="head"><span>${missed.length} question${missed.length === 1 ? "" : "s"}</span><span><button type="button" class="link" data-act="copy-missed">Copy as eval JSON</button><button type="button" class="quiet" data-act="clear-missed">Clear all</button></span></div>
        <ul>${missed.map((m) => `<li><a href="${searchHref(m.query)}" class="link">${esc(m.query)}</a><span class="meta"><time datetime="${new Date(m.at).toISOString()}">${new Date(m.at).toLocaleDateString()}</time><button type="button" class="quiet" data-act="remove-missed" data-q="${esc(m.query)}">Remove</button></span></li>`).join("")}</ul>
        <details class="notes-d" style="margin-top:2.5rem"><summary>Eval JSON</summary><textarea readonly rows="${Math.min(24, missed.length * 6 + 2)}">${esc(stub)}</textarea></details>
      </div>`
          : '<p class="muted" style="margin-top:2.5rem">Nothing saved yet.</p>'
      }
    </div>`;
  }

  function renderNotFound() {
    document.title = "Nothing here · Catechism Compass";
    main.innerHTML = `<div class="notfound"><p class="eyebrow" style="margin-bottom:.75rem">404</p><h1>Nothing here</h1><p><a href="#/" class="link">Back to search</a></p></div>`;
  }

  // ---------------------------------------------------------------------------------------------
  // Routing and events
  // ---------------------------------------------------------------------------------------------
  function route() {
    const hash = location.hash;
    if (hash && !hash.startsWith("#/")) {
      // In-page anchor (e.g. #ccc-2270 from "Cited in"): scroll, keep the current view.
      const el = document.getElementById(hash.slice(1));
      if (el) el.scrollIntoView();
      return;
    }
    const [pathPart, qs] = (hash.slice(1) || "/").split("?");
    const parts = pathPart.split("/").filter(Boolean);
    const params = new URLSearchParams(qs || "");
    window.scrollTo(0, 0);
    if (!parts.length) return renderHome((params.get("q") || "").trim().slice(0, 300));
    if (parts[0] === "ccc") return renderArticle(Number(parts[1]));
    if (parts[0] === "bible") return renderChapter(decodeURIComponent(parts[1] || ""), Number(parts[2]), parts[3] ? Number(parts[3]) : null);
    if (parts[0] === "topics") return renderTopics(parts[1] || null);
    if (parts[0] === "about") return renderAbout();
    if (parts[0] === "missed") return renderMissed();
    return renderNotFound();
  }

  function runSearch(q) {
    const trimmed = q.trim();
    if (!trimmed) return;
    const target = searchHref(trimmed);
    if (location.hash === target) renderHome(trimmed);
    else location.hash = target;
  }

  function rerenderCard(key) {
    const el = main.querySelector(`[data-card="${key}"]`);
    if (!el || !state.result) return;
    if (key[0] === "c") {
      const n = Number(key.slice(1));
      const hit = state.result.churchTeaching.flatMap((g) => g.hits).find((h) => h.n === n);
      if (hit) el.outerHTML = paragraphCardHtml(hit);
    } else {
      const id = Number(key.slice(1));
      const hit = state.result.scripture.flatMap((g) => g.hits).find((h) => h.id === id);
      if (hit) el.outerHTML = passageCardHtml(hit);
    }
  }

  main.addEventListener("submit", (e) => {
    if (e.target.id !== "search-form") return;
    e.preventDefault();
    runSearch(document.getElementById("q").value);
  });
  main.addEventListener("click", (e) => {
    // In-page anchors ("Cited in CCC 2180", paragraph tags in the reader) scroll without touching the hash.
    const anchor = e.target.closest('a[href^="#ccc-"], a[href^="#p"]');
    if (anchor) {
      const el = document.getElementById(anchor.getAttribute("href").slice(1));
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.q !== undefined && !btn.dataset.act) return runSearch(btn.dataset.q);
    const act = btn.dataset.act;
    if (!act) return;
    const card = btn.closest("[data-card]");
    if (act === "context" || act === "notes") {
      const key = card.dataset.card;
      const st = state.cards.get(key) || {};
      st[act] = !st[act];
      state.cards.set(key, st);
      rerenderCard(key);
    } else if (act === "miss" || act === "unmiss") {
      if (act === "miss") addMissed(state.query);
      else removeMissed(state.query.trim());
      const p = document.getElementById("missed-link");
      p.innerHTML = isMissed(state.query)
        ? `Saved to your <a href="#/missed" class="link">missed questions</a>. <button type="button" class="quiet" data-act="unmiss">Undo</button>`
        : `<button type="button" class="link" data-act="miss">I couldn't find what I was looking for</button>`;
    } else if (act === "clear-history") {
      clearHistory();
      renderHome("");
    } else if (act === "clear-missed") {
      clearMissed();
      renderMissed();
    } else if (act === "remove-missed") {
      removeMissed(btn.dataset.q);
      renderMissed();
    } else if (act === "copy-missed") {
      const ta = main.querySelector("textarea");
      if (ta && navigator.clipboard) {
        navigator.clipboard.writeText(ta.value).then(() => {
          btn.textContent = "Copied";
          setTimeout(() => (btn.textContent = "Copy as eval JSON"), 1500);
        }, () => {});
      }
    }
  });

  // Theme toggle (data-theme on <html>, remembered in localStorage; set before paint by the head script).
  const SUN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  const themeBtn = document.getElementById("theme-toggle");
  function paintTheme() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    themeBtn.innerHTML = dark ? SUN : MOON;
    themeBtn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    themeBtn.title = dark ? "Light mode" : "Dark mode";
  }
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("cc-theme", next);
    } catch {
      // ignore
    }
    paintTheme();
  });
  paintTheme();

  window.addEventListener("hashchange", route);
  route();
  // Build the keyword index once the first view is painted, so a search is instant.
  setTimeout(ensureIndex, 0);
  window.CatechismCompass = { search, matchTopics, queryTokens, stem, ensureIndex, keyword: (stems, weights, limit) => bm25(cccIndex, stems, weights, limit) };
})();
