/** Link to the chapter reader (Douay-Rheims chapter numbering), optionally anchored at a verse. */
export function bibleHref(book: string, drChapter: number, verse?: number | null): string {
  return `/bible/${book}/${drChapter}${verse ? `#v${verse}` : ""}`;
}
