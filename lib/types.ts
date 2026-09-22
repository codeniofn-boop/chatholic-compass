export type HeadingLevel = "part" | "section" | "chapter" | "article";

export interface Crumb {
  level: HeadingLevel;
  label: string;
  title: string;
}

export interface Footnote {
  num: number;
  text: string;
}

export interface ScriptureRef {
  book: string; // USFM code
  bookName: string;
  chapter: number; // modern numbering
  verseStart: number | null;
  verseEnd: number | null;
  drChapter: number;
  raw: string;
  reference: string; // display, modern naming
}

export interface CccParagraph {
  n: number;
  text: string;
  breadcrumb: Crumb[];
  headingId: number | null;
  footnotes: Footnote[];
  scriptureRefs: ScriptureRef[];
}

export interface CccHit extends CccParagraph {
  score: number;
  /** Why this paragraph is here: which signals fired. */
  signals: ("keyword" | "semantic" | "topic" | "scripture-link" | "norm")[];
}

export interface CccGroup {
  headingId: number | null;
  breadcrumb: Crumb[];
  /** Paragraph range of the article this group belongs to. */
  range: [number, number] | null;
  score: number;
  hits: CccHit[];
}

export interface BiblePassage {
  id: number;
  book: string;
  bookName: string;
  drBookName: string;
  chapter: number;
  /** Chapter number as modern Bibles print it (differs from `chapter` only in Psalms). */
  modernChapter: string;
  verseStart: number;
  verseEnd: number;
  reference: string;
  text: string;
  verses: { verse: number; text: string; notes: string[] }[];
}

export interface BibleHit extends BiblePassage {
  score: number;
  signals: ("keyword" | "semantic" | "topic" | "catechism-cites")[];
  /** Catechism paragraphs (in the result set) whose footnotes cite this passage. */
  citedBy: number[];
}

export interface BibleGroup {
  book: string;
  bookName: string;
  chapter: number;
  modernChapter: string;
  summary: string | null;
  score: number;
  hits: BibleHit[];
}

export interface TopicMatch {
  slug: string;
  name: string;
  category: string;
  description: string;
  ranges: [number, number][];
  matchedKeywords: string[];
}

export interface SearchResponse {
  query: string;
  topics: TopicMatch[];
  churchTeaching: CccGroup[];
  scripture: BibleGroup[];
  timings: { embedMs: number; searchMs: number };
}
