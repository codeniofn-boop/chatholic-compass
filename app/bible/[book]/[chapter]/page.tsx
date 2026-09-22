import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getChapter } from "@/lib/bible";
import { findBook } from "@/lib/bible-books";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ book: string; chapter: string }> }): Promise<Metadata> {
  const { book, chapter } = await params;
  const b = findBook(decodeURIComponent(book));
  return { title: b ? `${b.name} ${chapter}` : "Bible" };
}

export default async function ChapterPage({ params }: { params: Promise<{ book: string; chapter: string }> }) {
  const { book: rawBook, chapter: rawChapter } = await params;
  const book = findBook(decodeURIComponent(rawBook));
  const chapter = Number(rawChapter);
  if (!book || !Number.isInteger(chapter) || chapter < 1) notFound();
  const data = getChapter(getDb(), book.code, chapter);
  if (!data) notFound();
  const notes = data.verses.flatMap((v) => v.notes.map((text, i) => ({ id: `${v.verse}-${i}`, verse: v.verse, text })));

  return (
    <div className="mx-auto max-w-3xl pt-10 sm:pt-14">
      <p className="mb-6 text-xs">
        <Link href="/" className="text-ink-3 hover:text-ink">
          ← Search
        </Link>
      </p>
      <p className="eyebrow mb-2">
        {data.bookName}
        {data.drBookName !== data.bookName && <span className="normal-case tracking-normal"> · Douay-Rheims: {data.drBookName}</span>}
      </p>
      <h1 className="font-serif text-3xl leading-tight tracking-tight text-ink sm:text-4xl">
        {data.book === "PSA" ? "Psalm" : data.bookName} {data.modernChapter}
        {data.book === "PSA" && data.modernChapter !== String(data.chapter) && (
          <span className="ml-3 text-base font-normal text-ink-3">Douay-Rheims Psalm {data.chapter}</span>
        )}
      </h1>
      {data.psalmTitle && <p className="mt-2 font-serif italic text-ink-2">{data.psalmTitle}</p>}
      {data.summary && <p className="mt-3 max-w-2xl text-sm italic leading-relaxed text-ink-3">{data.summary}</p>}

      <div className="mt-10 border-t hairline pt-10">
        <p className="prose-text">
          {data.verses.map((v) => (
            <span key={v.verse} id={`v${v.verse}`} className="scroll-mt-24 target:bg-mark">
              <a href={`#v${v.verse}`} className="verse-num hover:text-accent">
                {v.verse}
              </a>
              {v.text}{" "}
            </span>
          ))}
        </p>
      </div>

      <nav className="mt-12 flex justify-between border-t hairline pt-6 text-sm">
        {chapter > 1 ? (
          <Link href={`/bible/${data.book}/${chapter - 1}`} className="link">
            ← {data.book === "PSA" ? "Psalm" : "Chapter"} {chapter - 1}
          </Link>
        ) : (
          <span />
        )}
        {chapter < data.chapters ? (
          <Link href={`/bible/${data.book}/${chapter + 1}`} className="link">
            {data.book === "PSA" ? "Psalm" : "Chapter"} {chapter + 1} →
          </Link>
        ) : (
          <span />
        )}
      </nav>

      {notes.length > 0 && (
        <section className="mt-12 border-t hairline pt-8">
          <p className="eyebrow mb-4">Challoner&apos;s notes</p>
          <ol className="space-y-2 text-sm leading-relaxed text-ink-2">
            {notes.map((n) => (
              <li key={n.id}>
                <a href={`#v${n.verse}`} className="mr-2 font-mono text-xs text-ink-3 hover:text-accent">
                  v. {n.verse}
                </a>
                {n.text}
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="mt-12 text-xs leading-relaxed text-ink-3">
        Douay-Rheims Bible, Challoner revision (public domain). Chapter and verse numbers follow the Douay-Rheims; Psalms are labelled
        with the modern (Hebrew) number, with the Douay-Rheims number alongside.
      </p>
    </div>
  );
}
