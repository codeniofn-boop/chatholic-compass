import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl pt-10 sm:pt-14">
      <p className="eyebrow mb-3">About</p>
      <h1 className="font-serif text-3xl tracking-tight text-ink sm:text-4xl">A reference tool, not an answer engine</h1>
      <div className="mt-8 space-y-5 text-base leading-relaxed text-ink-2">
        <p>
          Catechism Compass helps you find what the Church teaches on a moral or doctrinal question by returning the actual text of the{" "}
          <em>Catechism of the Catholic Church</em> and of Scripture, with their references, so you can read the sources yourself. Nothing
          on this site is generated: every result is a paragraph of the Catechism or a passage of the Bible.
        </p>
        <p>
          Results are ranked on this server by three local signals: keyword search, the semantic similarity of a small embedding model,
          and a hand-curated topic index that maps common questions to the paragraphs where the Catechism treats them. Passages that the
          Catechism itself cites in its footnotes are promoted in the Scripture panel. No external services are called.
        </p>
        <p>
          The Catechism text is © Libreria Editrice Vaticana / United States Conference of Catholic Bishops and is used here for
          reference. Scripture is the Douay-Rheims Bible (Challoner revision), which is in the public domain; modern book names and psalm
          numbers are shown alongside the Douay-Rheims ones.
        </p>
        <p className="border-l-2 border-accent pl-4 text-ink">
          This tool is a reference aid. It is not a substitute for a priest, a spiritual director, or the Magisterium of the Church. For
          questions about your own situation, talk to your pastor.
        </p>
        <p className="text-sm text-ink-3">
          Your searches are stored only in this browser. <Link href="/" className="link">Back to search</Link>
        </p>
      </div>
    </div>
  );
}
