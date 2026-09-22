/**
 * Retrieval evaluation against data/eval/questions.json.
 *   npm run eval            summary table
 *   npm run eval -- --verbose  also lists what was returned for misses
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { openDatabase } from "../lib/db";
import { resolveReference } from "../lib/bible";
import { search } from "../lib/search";
import { DATA_DIR } from "../lib/paths";

interface EvalQuestion {
  id: number;
  question: string;
  expectedCcc: number[];
  expectedBible: string[];
  /** Paragraphs that must all be within the first `k` results when ranked by score (ungrouped). */
  expectedCccTop?: { k: number; paragraphs: number[] };
  /** Pairs [a, b]: paragraph a must rank above paragraph b (b absent from the results also counts). */
  expectedCccAbove?: [number, number][];
}

async function main(): Promise<void> {
  const verbose = process.argv.includes("--verbose");
  const questions = JSON.parse(readFileSync(path.join(DATA_DIR, "eval", "questions.json"), "utf8")) as EvalQuestion[];
  const db = openDatabase({ readonly: true });

  let cccHitAny = 0;
  let cccRecallSum = 0;
  let cccTopGroupHit = 0;
  let bibleHitAny = 0;
  let bibleEvaluated = 0;
  let rankOk = 0;
  let rankEvaluated = 0;
  const rows: string[] = [];

  for (const q of questions) {
    const res = await search(db, q.question);
    const returned = res.churchTeaching.flatMap((g) => g.hits.map((h) => h.n));
    const found = q.expectedCcc.filter((n) => returned.includes(n));
    const recall = found.length / q.expectedCcc.length;
    cccRecallSum += recall;
    if (found.length) cccHitAny++;
    const topGroup = res.churchTeaching[0];
    const topGroupHit = !!topGroup && topGroup.hits.some((h) => q.expectedCcc.includes(h.n));
    if (topGroupHit) cccTopGroupHit++;

    // Ranking constraints, checked on the hits ordered by fused score rather than by group.
    const ranked = res.churchTeaching
      .flatMap((g) => g.hits)
      .sort((a, b) => b.score - a.score)
      .map((h) => h.n);
    let rank: boolean | null = null;
    if (q.expectedCccTop || q.expectedCccAbove) {
      rankEvaluated++;
      const top = q.expectedCccTop ? q.expectedCccTop.paragraphs.every((n) => ranked.slice(0, q.expectedCccTop!.k).includes(n)) : true;
      const above = (q.expectedCccAbove ?? []).every(([a, b]) => {
        const ia = ranked.indexOf(a);
        const ib = ranked.indexOf(b);
        return ia >= 0 && (ib < 0 || ia < ib);
      });
      rank = top && above;
      if (rank) rankOk++;
    }

    // Bible: does any returned passage overlap an expected reference?
    let bibleHit: boolean | null = null;
    if (q.expectedBible.length) {
      bibleEvaluated++;
      const expectedIds = new Set(q.expectedBible.flatMap((r) => resolveReference(db, r)));
      const returnedIds = res.scripture.flatMap((g) => g.hits.map((h) => h.id));
      bibleHit = returnedIds.some((id) => expectedIds.has(id));
      if (bibleHit) bibleHitAny++;
    }

    rows.push(
      `${String(q.id).padStart(2)}  ${q.question.slice(0, 58).padEnd(58)}  CCC ${found.length}/${q.expectedCcc.length}  top-group ${topGroupHit ? "✓" : "✗"}  Bible ${bibleHit === null ? "-" : bibleHit ? "✓" : "✗"}  rank ${rank === null ? "-" : rank ? "✓" : "✗"}  topics: ${res.topics.map((t) => t.slug).join(", ") || "-"}`,
    );
    if (verbose && (found.length < q.expectedCcc.length || bibleHit === false)) {
      rows.push(`      expected CCC ${q.expectedCcc.join(", ")} → returned ${returned.join(", ")}`);
      if (bibleHit === false) rows.push(`      expected Bible ${q.expectedBible.join("; ")} → returned ${res.scripture.flatMap((g) => g.hits.map((h) => h.reference)).join("; ")}`);
    }
    if (verbose && rank !== null) {
      const want = [
        q.expectedCccTop ? `${q.expectedCccTop.paragraphs.join(", ")} in top ${q.expectedCccTop.k}` : "",
        ...(q.expectedCccAbove ?? []).map(([a, b]) => `${a} above ${b}`),
      ].filter(Boolean);
      rows.push(`      ranking: want ${want.join("; ")} → ranked ${ranked.slice(0, 5).join(", ")} …`);
    }
  }

  console.log(rows.join("\n"));
  console.log("\nSummary");
  console.log(`  questions with ≥1 expected paragraph in top-10:  ${cccHitAny}/${questions.length}`);
  console.log(`  mean paragraph recall@10:                        ${(cccRecallSum / questions.length).toFixed(2)}`);
  console.log(`  expected paragraph in the first group:           ${cccTopGroupHit}/${questions.length}`);
  console.log(`  questions with an expected passage in Scripture: ${bibleHitAny}/${bibleEvaluated}`);
  console.log(`  ranking constraints satisfied:                   ${rankOk}/${rankEvaluated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
