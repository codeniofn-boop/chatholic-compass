/**
 * Quick command-line test of the search pipeline.
 *   npm run search -- "Is it a sin to skip Mass?"
 *   npm run search -- --json "IVF"
 */
import { openDatabase } from "../lib/db";
import { search } from "../lib/search";
import { truncate } from "../lib/text";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const query = args.filter((a) => !a.startsWith("--")).join(" ").trim();
  if (!query) {
    console.error('Usage: npm run search -- "your question"');
    process.exit(1);
  }
  const db = openDatabase({ readonly: true });
  const result = await search(db, query);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`\nQuery: ${result.query}`);
  console.log(`(embedding ${result.timings.embedMs} ms, search ${result.timings.searchMs} ms)\n`);
  if (result.topics.length) {
    console.log("Topics:");
    for (const t of result.topics) console.log(`  • ${t.name} [${t.category}] — matched: ${t.matchedKeywords.join(", ")}`);
    console.log();
  }
  console.log("CHURCH TEACHING (Catechism)");
  for (const g of result.churchTeaching) {
    console.log(`\n  ${g.breadcrumb.map((c) => `${c.label}: ${c.title}`).join(" › ")}${g.range ? `  [¶${g.range[0]}–${g.range[1]}]` : ""}`);
    for (const h of g.hits) {
      console.log(`    ¶${h.n}  (${h.score.toFixed(4)}; ${h.signals.join(", ")})`);
      console.log(`      ${truncate(h.text, 220)}`);
      if (h.scriptureRefs.length) console.log(`      cites: ${h.scriptureRefs.map((r) => r.reference).join("; ")}`);
    }
  }
  console.log("\nSCRIPTURE (Douay-Rheims)");
  for (const g of result.scripture) {
    console.log(`\n  ${g.bookName} ${g.modernChapter}${g.summary ? ` — ${g.summary}` : ""}`);
    for (const h of g.hits) {
      console.log(`    ${h.reference}  (${h.score.toFixed(4)}; ${h.signals.join(", ")}${h.citedBy.length ? `; cited by ¶${h.citedBy.join(", ¶")}` : ""})`);
      console.log(`      ${truncate(h.text, 220)}`);
    }
  }
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
