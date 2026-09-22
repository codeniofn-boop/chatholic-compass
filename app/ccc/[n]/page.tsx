import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { getDb } from "@/lib/db";
import { getHeading, getParagraph, getParagraphs, getRelated } from "@/lib/ccc";
import { bibleHref } from "@/lib/links";
import { truncate } from "@/lib/text";

export const dynamic = "force-dynamic";

function parseN(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 2865 ? n : null;
}

export async function generateMetadata({ params }: { params: Promise<{ n: string }> }): Promise<Metadata> {
  const { n } = await params;
  return { title: `CCC ${n}` };
}

export default async function ParagraphPage({ params }: { params: Promise<{ n: string }> }) {
  const { n: raw } = await params;
  const n = parseN(raw);
  if (!n) notFound();
  const db = getDb();
  const target = getParagraph(db, n);
  if (!target) notFound();
  const unit = target.headingId ? getHeading(db, target.headingId) : null;
  const first = unit?.first ?? Math.max(1, n - 5);
  const last = unit?.last ?? Math.min(2865, n + 5);
  const range = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const paragraphs = getParagraphs(db, range);
  const related = getRelated(db, n, 6).filter((r) => r < first || r > last);
  const relatedParagraphs = getParagraphs(db, related, false);

  return (
    <div className="mx-auto max-w-3xl pt-10 sm:pt-14">
      <p className="mb-6 text-xs">
        <Link href={`/?q=`} className="text-ink-3 hover:text-ink">
          ← Search
        </Link>
      </p>
      {unit ? (
        <>
          <Breadcrumb crumbs={unit.breadcrumb.slice(0, -1)} className="mb-2" />
          <h1 className="font-serif text-3xl leading-tight tracking-tight text-ink sm:text-4xl">
            <span className="mr-3 font-mono text-sm uppercase tracking-widest text-ink-3">{unit.label}</span>
            {unit.title}
          </h1>
          <p className="mt-3 text-xs text-ink-3">
            Paragraphs {unit.first}–{unit.last} · Catechism of the Catholic Church
          </p>
        </>
      ) : (
        <h1 className="font-serif text-3xl tracking-tight text-ink">
          {target.breadcrumb[0]?.label}: {target.breadcrumb[0]?.title}
        </h1>
      )}

      <div className="mt-10 space-y-8 border-t hairline pt-10">
        {range.map((k) => {
          const p = paragraphs.get(k);
          if (!p) return null;
          const isTarget = k === n;
          return (
            <article key={k} id={`p${k}`} className={`scroll-mt-24 ${isTarget ? "highlight -ml-3 pl-3" : ""}`}>
              <div className="mb-1.5 flex items-baseline gap-4">
                <a href={`#p${k}`} className="tag">
                  CCC {k}
                </a>
              </div>
              <p className="prose-text">{p.text}</p>
              {p.scriptureRefs.length > 0 && (
                <p className="mt-2 text-xs leading-relaxed text-ink-3">
                  <span className="mr-2 font-mono uppercase tracking-wider">Cites</span>
                  {[...new Map(p.scriptureRefs.map((r) => [r.reference, r])).values()].map((r, i, arr) => (
                    <span key={r.reference}>
                      <Link href={bibleHref(r.book, r.drChapter, r.verseStart)} className="link">
                        {r.reference}
                      </Link>
                      {i < arr.length - 1 ? "; " : ""}
                    </span>
                  ))}
                </p>
              )}
              {p.footnotes.length > 0 && (
                <details className="mt-2 text-xs text-ink-2">
                  <summary className="cursor-pointer text-ink-3 hover:text-ink">Notes ({p.footnotes.length})</summary>
                  <ol className="mt-2 space-y-1 border-l hairline pl-4 leading-relaxed">
                    {p.footnotes.map((f) => (
                      <li key={f.num}>
                        <span className="mr-1 font-mono text-ink-3">{f.num}</span>
                        {f.text}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </article>
          );
        })}
      </div>

      <nav className="mt-14 flex justify-between border-t hairline pt-6 text-sm">
        {first > 1 ? (
          <Link href={`/ccc/${first - 1}`} className="link">
            ← Previous article
          </Link>
        ) : (
          <span />
        )}
        {last < 2865 ? (
          <Link href={`/ccc/${last + 1}`} className="link">
            Next article →
          </Link>
        ) : (
          <span />
        )}
      </nav>

      {relatedParagraphs.size > 0 && (
        <section className="mt-14 border-t hairline pt-8">
          <p className="eyebrow mb-4">Related paragraphs</p>
          <ul className="space-y-4">
            {[...relatedParagraphs.values()].map((p) => (
              <li key={p.n} className="text-sm leading-relaxed text-ink-2">
                <Link href={`/ccc/${p.n}`} className="tag mr-3">
                  CCC {p.n}
                </Link>
                {truncate(p.text, 200)}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-3">Grouped together by the Compendium of the Catechism.</p>
        </section>
      )}
    </div>
  );
}
