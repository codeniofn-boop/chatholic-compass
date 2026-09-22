/**
 * The 73 books of the Catholic canon, in traditional order, keyed by USFM book code.
 *
 * `name` is the modern English name used for display and citations (matching how the
 * Catechism cites Scripture). `drName` is the name used in the Douay-Rheims (Vulgate
 * naming), shown as an alias so readers of the printed Douay-Rheims are not confused.
 * `abbrevs` lists the abbreviations accepted when parsing references (lower-case, no
 * spaces/periods), including the abbreviations the Catechism footnotes use.
 */
export type Testament = "OT" | "NT";

export interface BibleBook {
  code: string;
  order: number;
  name: string;
  drName: string;
  testament: Testament;
  deuterocanonical: boolean;
  abbrevs: string[];
}

const B = (
  code: string,
  order: number,
  name: string,
  drName: string,
  testament: Testament,
  deuterocanonical: boolean,
  abbrevs: string[],
): BibleBook => ({ code, order, name, drName, testament, deuterocanonical, abbrevs });

export const BIBLE_BOOKS: BibleBook[] = [
  B("GEN", 1, "Genesis", "Genesis", "OT", false, ["gen", "ge", "gn"]),
  B("EXO", 2, "Exodus", "Exodus", "OT", false, ["ex", "exo", "exod"]),
  B("LEV", 3, "Leviticus", "Leviticus", "OT", false, ["lev", "lv"]),
  B("NUM", 4, "Numbers", "Numbers", "OT", false, ["num", "nm", "nb"]),
  B("DEU", 5, "Deuteronomy", "Deuteronomy", "OT", false, ["deut", "dt", "deu"]),
  B("JOS", 6, "Joshua", "Josue", "OT", false, ["josh", "jos", "josue"]),
  B("JDG", 7, "Judges", "Judges", "OT", false, ["judg", "jgs", "jdg", "jg"]),
  B("RUT", 8, "Ruth", "Ruth", "OT", false, ["ruth", "ru", "rut"]),
  B("1SA", 9, "1 Samuel", "1 Kings", "OT", false, ["1sam", "1sm", "1sa", "1samuel"]),
  B("2SA", 10, "2 Samuel", "2 Kings", "OT", false, ["2sam", "2sm", "2sa", "2samuel"]),
  B("1KI", 11, "1 Kings", "3 Kings", "OT", false, ["1kings", "1kgs", "1ki", "1kg", "3kings"]),
  B("2KI", 12, "2 Kings", "4 Kings", "OT", false, ["2kings", "2kgs", "2ki", "2kg", "4kings"]),
  B("1CH", 13, "1 Chronicles", "1 Paralipomenon", "OT", false, ["1chr", "1chron", "1ch", "1chronicles", "1par"]),
  B("2CH", 14, "2 Chronicles", "2 Paralipomenon", "OT", false, ["2chr", "2chron", "2ch", "2chronicles", "2par"]),
  B("EZR", 15, "Ezra", "1 Esdras", "OT", false, ["ezra", "ezr", "1esd", "1esdras"]),
  B("NEH", 16, "Nehemiah", "2 Esdras", "OT", false, ["neh", "nehemiah", "2esd", "2esdras"]),
  B("TOB", 17, "Tobit", "Tobias", "OT", true, ["tob", "tobit", "tb", "tobias"]),
  B("JDT", 18, "Judith", "Judith", "OT", true, ["jdt", "judith", "jth"]),
  B("EST", 19, "Esther", "Esther", "OT", false, ["esth", "est", "esther"]),
  B("JOB", 20, "Job", "Job", "OT", false, ["job", "jb"]),
  B("PSA", 21, "Psalms", "Psalms", "OT", false, ["ps", "psa", "pss", "psalm", "psalms", "psl"]),
  B("PRO", 22, "Proverbs", "Proverbs", "OT", false, ["prov", "pr", "prv", "pro", "proverbs"]),
  B("ECC", 23, "Ecclesiastes", "Ecclesiastes", "OT", false, ["eccl", "eccles", "ecc", "qoh", "ecclesiastes"]),
  B("SNG", 24, "Song of Songs", "Canticle of Canticles", "OT", false, ["song", "sg", "sng", "cant", "canticles", "songofsongs", "songofsolomon"]),
  B("WIS", 25, "Wisdom", "Wisdom", "OT", true, ["wis", "wisd", "wisdom", "ws"]),
  B("SIR", 26, "Sirach", "Ecclesiasticus", "OT", true, ["sir", "sirach", "ecclus", "ecclesiasticus"]),
  B("ISA", 27, "Isaiah", "Isaias", "OT", false, ["isa", "is", "isaiah", "isaias"]),
  B("JER", 28, "Jeremiah", "Jeremias", "OT", false, ["jer", "jeremiah", "jeremias"]),
  B("LAM", 29, "Lamentations", "Lamentations", "OT", false, ["lam", "lamentations"]),
  B("BAR", 30, "Baruch", "Baruch", "OT", true, ["bar", "baruch"]),
  B("EZK", 31, "Ezekiel", "Ezechiel", "OT", false, ["ezek", "ez", "ezk", "ezekiel", "ezechiel"]),
  B("DAN", 32, "Daniel", "Daniel", "OT", false, ["dan", "dn", "daniel"]),
  B("HOS", 33, "Hosea", "Osee", "OT", false, ["hos", "hosea", "osee"]),
  B("JOL", 34, "Joel", "Joel", "OT", false, ["joel", "jl", "jol"]),
  B("AMO", 35, "Amos", "Amos", "OT", false, ["amos", "am", "amo"]),
  B("OBA", 36, "Obadiah", "Abdias", "OT", false, ["obad", "ob", "oba", "obadiah", "abdias"]),
  B("JON", 37, "Jonah", "Jonas", "OT", false, ["jon", "jonah", "jonas"]),
  B("MIC", 38, "Micah", "Micheas", "OT", false, ["mic", "micah", "micheas"]),
  B("NAM", 39, "Nahum", "Nahum", "OT", false, ["nah", "nam", "nahum"]),
  B("HAB", 40, "Habakkuk", "Habacuc", "OT", false, ["hab", "habakkuk", "habacuc"]),
  B("ZEP", 41, "Zephaniah", "Sophonias", "OT", false, ["zeph", "zep", "zephaniah", "sophonias"]),
  B("HAG", 42, "Haggai", "Aggeus", "OT", false, ["hag", "haggai", "aggeus"]),
  B("ZEC", 43, "Zechariah", "Zacharias", "OT", false, ["zech", "zec", "zechariah", "zacharias"]),
  B("MAL", 44, "Malachi", "Malachias", "OT", false, ["mal", "malachi", "malachias"]),
  B("1MA", 45, "1 Maccabees", "1 Machabees", "OT", true, ["1macc", "1mac", "1ma", "1mc", "1maccabees", "1machabees"]),
  B("2MA", 46, "2 Maccabees", "2 Machabees", "OT", true, ["2macc", "2mac", "2ma", "2mc", "2maccabees", "2machabees"]),
  B("MAT", 47, "Matthew", "Matthew", "NT", false, ["mt", "matt", "mat", "matthew"]),
  B("MRK", 48, "Mark", "Mark", "NT", false, ["mk", "mark", "mrk", "mr"]),
  B("LUK", 49, "Luke", "Luke", "NT", false, ["lk", "luke", "luk"]),
  B("JHN", 50, "John", "John", "NT", false, ["jn", "john", "jhn", "joh"]),
  B("ACT", 51, "Acts", "Acts", "NT", false, ["acts", "ac", "act"]),
  B("ROM", 52, "Romans", "Romans", "NT", false, ["rom", "ro", "rm", "romans"]),
  B("1CO", 53, "1 Corinthians", "1 Corinthians", "NT", false, ["1cor", "1co", "1corinthians"]),
  B("2CO", 54, "2 Corinthians", "2 Corinthians", "NT", false, ["2cor", "2co", "2corinthians"]),
  B("GAL", 55, "Galatians", "Galatians", "NT", false, ["gal", "ga", "galatians"]),
  B("EPH", 56, "Ephesians", "Ephesians", "NT", false, ["eph", "ephesians"]),
  B("PHP", 57, "Philippians", "Philippians", "NT", false, ["phil", "php", "philippians", "phi"]),
  B("COL", 58, "Colossians", "Colossians", "NT", false, ["col", "colossians"]),
  B("1TH", 59, "1 Thessalonians", "1 Thessalonians", "NT", false, ["1thess", "1th", "1thes", "1thessalonians"]),
  B("2TH", 60, "2 Thessalonians", "2 Thessalonians", "NT", false, ["2thess", "2th", "2thes", "2thessalonians"]),
  B("1TI", 61, "1 Timothy", "1 Timothy", "NT", false, ["1tim", "1ti", "1tm", "1timothy"]),
  B("2TI", 62, "2 Timothy", "2 Timothy", "NT", false, ["2tim", "2ti", "2tm", "2timothy"]),
  B("TIT", 63, "Titus", "Titus", "NT", false, ["titus", "tit", "ti"]),
  B("PHM", 64, "Philemon", "Philemon", "NT", false, ["philem", "phlm", "phm", "philemon"]),
  B("HEB", 65, "Hebrews", "Hebrews", "NT", false, ["heb", "hebrews"]),
  B("JAS", 66, "James", "James", "NT", false, ["jas", "jam", "james"]),
  B("1PE", 67, "1 Peter", "1 Peter", "NT", false, ["1pet", "1pe", "1pt", "1peter"]),
  B("2PE", 68, "2 Peter", "2 Peter", "NT", false, ["2pet", "2pe", "2pt", "2peter"]),
  B("1JN", 69, "1 John", "1 John", "NT", false, ["1jn", "1john", "1jo"]),
  B("2JN", 70, "2 John", "2 John", "NT", false, ["2jn", "2john", "2jo"]),
  B("3JN", 71, "3 John", "3 John", "NT", false, ["3jn", "3john", "3jo"]),
  B("JUD", 72, "Jude", "Jude", "NT", false, ["jude", "jud", "jd"]),
  B("REV", 73, "Revelation", "Apocalypse", "NT", false, ["rev", "rv", "revelation", "apoc", "apocalypse", "ap"]),
];

export const BOOK_BY_CODE: Record<string, BibleBook> = Object.fromEntries(BIBLE_BOOKS.map((b) => [b.code, b]));

const ABBREV_INDEX: Map<string, BibleBook> = new Map();
for (const book of BIBLE_BOOKS) {
  ABBREV_INDEX.set(normalizeBookKey(book.name), book);
  ABBREV_INDEX.set(normalizeBookKey(book.drName), book);
  for (const a of book.abbrevs) ABBREV_INDEX.set(normalizeBookKey(a), book);
}

/** Lower-case, strip periods/spaces, and fold roman numerals used for numbered books (I Cor -> 1cor). */
export function normalizeBookKey(raw: string): string {
  let s = raw.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
  s = s.replace(/^(iii|ii|i)(?=[a-z])/, (m) => String(m.length));
  s = s.replace(/^(first|second|third)(?=[a-z])/, (m) => ({ first: "1", second: "2", third: "3" })[m] as string);
  s = s.replace(/^st(?=[a-z])/, ""); // "St. Matthew"
  return s;
}

export function findBook(raw: string): BibleBook | undefined {
  return ABBREV_INDEX.get(normalizeBookKey(raw));
}

/**
 * The Douay-Rheims follows the Septuagint/Vulgate Psalm numbering, while the Catechism (and
 * most modern Bibles) follow the Hebrew numbering. Convert a Hebrew psalm number to the
 * Douay-Rheims chapter that contains it. Psalms 9/10 and 114/115 (Hebrew) are single psalms
 * in the Vulgate; Hebrew 116 and 147 are split in two.
 */
export function hebrewPsalmToDouay(hebrew: number): number {
  if (hebrew <= 8) return hebrew;
  if (hebrew === 9 || hebrew === 10) return 9;
  if (hebrew <= 113) return hebrew - 1;
  if (hebrew === 114 || hebrew === 115) return 113;
  if (hebrew === 116) return 114; // 116:1-9 -> 114, 116:10-19 -> 115 (caller may refine by verse)
  if (hebrew <= 146) return hebrew - 1;
  if (hebrew === 147) return 146; // 147:1-11 -> 146, 147:12-20 -> 147
  return hebrew; // 148-150
}

/** Inverse of hebrewPsalmToDouay for display: Douay chapter -> Hebrew psalm number(s). */
export function douayPsalmToHebrew(douay: number): string {
  if (douay <= 8) return String(douay);
  if (douay === 9) return "9–10";
  if (douay <= 112) return String(douay + 1);
  if (douay === 113) return "114–115";
  if (douay === 114 || douay === 115) return "116";
  if (douay <= 145) return String(douay + 1);
  if (douay === 146 || douay === 147) return "147";
  return String(douay);
}
