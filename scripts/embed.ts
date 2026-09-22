/**
 * Computes embeddings for every Catechism paragraph and Bible passage and stores them in the
 * sqlite-vec tables. Safe to re-run: rows that already have an embedding are skipped.
 */
import { openDatabase, setMeta } from "../lib/db";
import { embedTexts, EMBEDDING_MODEL } from "../lib/embeddings";

const BATCH = 64;

async function embedTable(
  label: string,
  rows: { id: number; text: string }[],
  insert: (id: number, vec: Float32Array) => void,
): Promise<void> {
  const started = Date.now();
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const vecs = await embedTexts(slice.map((r) => r.text));
    for (let j = 0; j < slice.length; j++) insert(slice[j].id, vecs[j]);
    const done = Math.min(i + BATCH, rows.length);
    if (done % (BATCH * 10) === 0 || done === rows.length) {
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      process.stdout.write(`\r${label}: ${done}/${rows.length} (${secs}s)`);
    }
  }
  process.stdout.write("\n");
}

async function main(): Promise<void> {
  const db = openDatabase();
  console.log(`Embedding model: ${EMBEDDING_MODEL}`);

  const cccRows = db
    .prepare(
      `SELECT p.n AS id, p.text, p.breadcrumb FROM ccc_paragraphs p
       WHERE p.n NOT IN (SELECT n FROM ccc_vec) ORDER BY p.n`,
    )
    .all() as { id: number; text: string; breadcrumb: string }[];
  const insertCcc = db.prepare("INSERT INTO ccc_vec(n, embedding) VALUES (?, ?)");
  const cccTx = db.transaction((id: number, vec: Float32Array) => insertCcc.run(BigInt(id), vec));
  // The article heading is prepended so short paragraphs carry their topic ("The Fifth Commandment").
  await embedTable(
    "Catechism paragraphs",
    cccRows.map((r) => {
      const crumbs = JSON.parse(r.breadcrumb) as { level: string; title: string }[];
      const article = crumbs.find((c) => c.level === "article") ?? crumbs[crumbs.length - 1];
      return { id: r.id, text: article ? `${article.title}. ${r.text}` : r.text };
    }),
    (id, vec) => cccTx(id, vec),
  );

  const bibleRows = db
    .prepare(
      `SELECT p.id, p.text FROM bible_passages p
       WHERE p.id NOT IN (SELECT id FROM bible_vec) ORDER BY p.id`,
    )
    .all() as { id: number; text: string }[];
  const insertBible = db.prepare("INSERT INTO bible_vec(id, embedding) VALUES (?, ?)");
  const bibleTx = db.transaction((id: number, vec: Float32Array) => insertBible.run(BigInt(id), vec));
  await embedTable("Bible passages", bibleRows, (id, vec) => bibleTx(id, vec));

  setMeta(db, "embedding_model", EMBEDDING_MODEL);
  setMeta(db, "embedded_at", new Date().toISOString());
  const counts = {
    ccc: (db.prepare("SELECT count(*) c FROM ccc_vec").get() as { c: number }).c,
    bible: (db.prepare("SELECT count(*) c FROM bible_vec").get() as { c: number }).c,
  };
  console.log("Vectors stored:", counts);
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
