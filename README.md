# Catechism Compass

A search and reference tool for Catholics who want to know what the Church teaches on a moral or
doctrinal topic, grounded in the **Catechism of the Catholic Church (CCC)** and the **Bible**.

Type a question in plain language ("Is it a sin to skip Mass?", "What does the Church teach about
IVF?", "Where does the Bible talk about forgiveness?") and the app returns the most relevant
Catechism paragraphs, each with its Part / Section / Chapter / Article breadcrumb and the option to
read the surrounding paragraphs, alongside the Scripture passages that the Catechism cites or that
match your question.

**This is a search tool, not an AI answer engine.** Nothing is generated: every result is the actual
text of the Catechism or of the Bible, shown with its reference so you can read the source yourself.
Ranking runs entirely on your machine (keyword search plus a small local embedding model); the app
makes no calls to external APIs.

> Catechism Compass is a reference aid. It is not a substitute for a priest, a spiritual director,
> or the Magisterium of the Church. For questions about your own situation, talk to your pastor.

## How it works

1. **Data** — the full CCC (paragraphs 1–2865 with their heading hierarchy and footnotes) and the
   Douay-Rheims Bible (73 books) are downloaded at setup time and stored in a local SQLite database
   (`data/compass.db`).
2. **Search** — each query runs three signals that are fused by reciprocal rank fusion:
   - *keyword*: SQLite FTS5 BM25 over paragraph and passage text;
   - *semantic*: cosine similarity of `all-MiniLM-L6-v2` sentence embeddings, computed locally with
     Transformers.js and stored in `sqlite-vec`;
   - *topic*: a curated index (`data/topics.json`) that maps common questions (marriage, life
     issues, sacraments, social justice, …) to Catechism paragraph ranges and key passages, so
     frequent questions get reliable hits even when free-text search is fuzzy.
   Catechism paragraphs and Bible passages are also cross-linked: passages cited in the footnotes
   of the top paragraphs are promoted, and vice versa.
3. **Results** — Catechism hits are grouped by Article (with the full breadcrumb and paragraph
   range) and Scripture hits by chapter, each showing which signals put it there.

## Requirements

- Node.js 20 or newer (tested on 22)
- `git` and `unzip` on the PATH (used by the source download script)
- About 400 MB of disk for sources, model and database

## Setup

```bash
npm install
cp .env.example .env      # optional: defaults work as-is
npm run setup             # = fetch-sources + ingest + embed (≈5 minutes, one-off)
npm run dev
```

Then open http://localhost:3000.

`npm run setup` does three things:

| Step | Script | What it does |
| --- | --- | --- |
| 1 | `npm run fetch-sources` | Downloads the Catechism corpus release (checksum-verified) and clones the Douay-Rheims USFM repository into `data/raw/` (gitignored). |
| 2 | `npm run ingest` | Parses both into `data/compass.db`: paragraphs, headings, footnotes, Scripture references, verses, passages, topics. Takes a few seconds; safe to re-run. |
| 3 | `npm run embed` | Computes embeddings for 2,865 paragraphs and ~9,700 Bible passages. The model (~23 MB) is downloaded from the Hugging Face Hub on first use and cached in `data/models/`. |

Offline machines: set `EMBEDDING_MODEL_DIR` in `.env` to a directory that already contains
`Xenova/all-MiniLM-L6-v2/{config.json,tokenizer.json,tokenizer_config.json,special_tokens_map.json,onnx/model_quantized.onnx}`.
If `npm install` fails while `onnxruntime-node` tries to download optional CUDA binaries, run it with
`ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm install`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve |
| `npm run search -- "question"` | Search from the command line (add `--json` for the raw response) |
| `npm run eval` | Run the retrieval evaluation set in `data/eval/questions.json` (`--verbose` shows misses) |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |

## API

All routes are local Next.js route handlers reading the SQLite database.

- `GET /api/search?q=...&ccc=10&bible=8` — ranked results: matched topics, Catechism groups
  (`churchTeaching`) and Scripture groups (`scripture`).
- `GET /api/ccc/2270?context=3` — a paragraph with footnotes and parsed Scripture references, its
  neighbours clipped to the same Article, and related paragraphs (grouped together by the
  *Compendium of the Catechism*).
- `GET /api/bible/MAT/5` — a full chapter (Douay-Rheims chapter numbering) with Challoner's chapter
  summary and notes.

## Evaluation

`data/eval/questions.json` holds 18 sample questions with the Catechism paragraphs (and, where
useful, Bible passages) one would expect to see. `npm run eval` reports, for each question, how many
expected paragraphs appear in the top 10, whether the first result group contains one, and whether an
expected passage appears in the Scripture panel. Use it after changing weights in `lib/search.ts` or
entries in `data/topics.json`.

## Data sources and licensing

| Text | Source | License |
| --- | --- | --- |
| Catechism of the Catholic Church (English, 2nd ed., with the 2018 revision of ¶2267) | `CCC.jsonl` from the [Catholic Doctrine and Magisterium RAG Corpus v1.0.0](https://github.com/GibbilyGooo/catholic-doctrine-magisterium-rag-corpus) (AD IPSUM), whose text was transcribed from the Vatican archive | The corpus metadata is CC0, but **the Catechism text is © 1994/1997 United States Conference of Catholic Bishops – Libreria Editrice Vaticana**. It is not public domain and is not relicensed by the corpus. |
| Cross-references from the *Compendium of the Catechism* | `source/derived/cross_reference_graph.json` in the same corpus | Only the paragraph-number groupings are used (which CCC paragraphs a Compendium question points to), stored as pairs of integers to power "Related paragraphs". **No Compendium text is downloaded, stored or displayed.** |
| Catechism heading tree | [nossbigg/catechism-ccc-json](https://github.com/nossbigg/catechism-ccc-json) (`reference/toc-reference.txt`, used only to cross-check heading titles) | No license stated; headings are part of the CCC text above. |
| Douay-Rheims Bible, Challoner revision, with Challoner's notes and chapter summaries | [BibleCorps/ENG-B-DRC1750-pd-PSFM](https://github.com/BibleCorps/ENG-B-DRC1750-pd-PSFM) (USFM) | Public domain ("This entire text is in the public domain. No copyright."). |
| Embedding model `all-MiniLM-L6-v2` (ONNX build by Xenova) | Hugging Face Hub | Apache-2.0 |

**Catechism copyright.** The USCCB permits quoting fewer than 5,000 words without permission (with
the copyright notice); making more than 5,000 words available to the public, even free of charge,
requires written permission from the USCCB, and commercial use requires a royalty. This app displays
full paragraphs on demand, so it is intended for **private and development use**. The Catechism text
is downloaded at setup time and is never committed to this repository (`data/raw/` and the database
are gitignored). **Obtaining USCCB permission is a required step before any public deployment.**

**Bible translation.** The Douay-Rheims is used because it is the Catholic translation that is in the
public domain. Its trade-offs: 18th-century English; Vulgate book names (shown here with modern names,
e.g. "1 Samuel (1 Kings)"); Septuagint/Vulgate psalm numbering (the app converts Catechism references
such as "Ps 51" to Douay-Rheims Psalm 50, and labels Psalms with the modern number); and some verse
divisions that differ from modern Bibles, so a reference may land one verse off in the Psalms and a
few other places. The RSV-CE and NABRE are copyrighted (National Council of Churches and Confraternity
of Christian Doctrine respectively) and need a license for full-text use, so they are not included.
The importer can be pointed at other USFM files (for example the public-domain World English Bible
Catholic Edition from ebible.org) if you place them in `data/raw/` and adjust `scripts/ingest.ts`.

## Known limitations

- Scripture references are parsed from the Catechism's footnotes; a few footnotes in the source
  transcription are malformed and are dropped when they point to a chapter that does not exist.
- The topic index is hand-curated and deliberately small; it improves common questions but does not
  cover everything. Contributions to `data/topics.json` are welcome.
- Search history is stored only in your browser (`localStorage`); there are no accounts.

## Project layout

```
app/            Next.js App Router pages and API routes
components/     UI components
lib/            database, search, embeddings, Catechism/Bible lookups, book table
scripts/        fetch-sources, ingest, embed, search-cli, eval
data/eval/      evaluation questions (committed)
data/topics.json  curated topic index (committed)
data/raw/, data/models/, data/compass.db   downloaded sources, model, database (gitignored)
```
