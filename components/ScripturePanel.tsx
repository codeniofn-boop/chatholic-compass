"use client";

import { useState } from "react";
import Link from "next/link";
import type { BibleGroup, BibleHit } from "@/lib/types";
import { bibleHref } from "@/lib/links";

export function ScripturePanel({ groups }: { groups: BibleGroup[] }) {
  const count = groups.reduce((n, g) => n + g.hits.length, 0);
  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between border-b hairline pb-3">
        <h2 className="font-serif text-2xl tracking-tight text-ink">Scripture</h2>
        <span className="text-xs text-ink-3">
          {count} passage{count === 1 ? "" : "s"} · Douay-Rheims
        </span>
      </div>
      {groups.length === 0 && <p className="text-sm text-ink-2">No passages matched closely enough.</p>}
      <div className="space-y-10">
        {groups.map((g) => (
          <section key={`${g.book}-${g.chapter}`}>
            <div className="mb-4">
              <h3 className="font-serif text-lg leading-snug text-ink">
                {g.book === "PSA" ? "Psalm" : g.bookName} {g.modernChapter}
                {g.book === "PSA" && g.modernChapter !== String(g.chapter) && (
                  <span className="ml-2 text-xs font-normal text-ink-3">(Douay-Rheims Psalm {g.chapter})</span>
                )}
              </h3>
              {g.summary && <p className="mt-1 text-xs italic leading-relaxed text-ink-3">{g.summary}</p>}
            </div>
            <div className="space-y-6">
              {g.hits.map((h) => (
                <PassageCard key={h.id} hit={h} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

const SIGNAL_LABEL: Record<BibleHit["signals"][number], string> = {
  keyword: "keyword",
  semantic: "meaning",
  topic: "topic index",
  "catechism-cites": "cited by the Catechism",
};

function PassageCard({ hit }: { hit: BibleHit }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const notes = hit.verses.flatMap((v) => v.notes.map((n) => ({ verse: v.verse, text: n })));
  return (
    <article className="scroll-mt-24">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Link href={bibleHref(hit.book, hit.chapter, hit.verseStart)} className="tag">
          {hit.reference}
        </Link>
        <span className="text-[0.68rem] text-ink-3">{hit.signals.map((s) => SIGNAL_LABEL[s]).join(" · ")}</span>
      </div>
      <p className="prose-text">
        {hit.verses.map((v) => (
          <span key={v.verse}>
            <span className="verse-num">{v.verse}</span>
            {v.text}{" "}
          </span>
        ))}
      </p>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs">
        <Link href={bibleHref(hit.book, hit.chapter, hit.verseStart)} className="link">
          Read the full chapter
        </Link>
        {notes.length > 0 && (
          <button type="button" onClick={() => setNotesOpen((v) => !v)} aria-expanded={notesOpen} className="text-ink-3 hover:text-ink active:opacity-75">
            {notesOpen ? "Hide notes" : `Challoner's notes (${notes.length})`}
          </button>
        )}
        {hit.citedBy.length > 0 && (
          <span className="text-ink-3">
            Cited in{" "}
            {hit.citedBy.map((n, i) => (
              <span key={n}>
                <a href={`#ccc-${n}`} className="link">
                  CCC {n}
                </a>
                {i < hit.citedBy.length - 1 ? ", " : ""}
              </span>
            ))}
          </span>
        )}
      </div>
      {notesOpen && (
        <ul className="mt-3 space-y-1 border-l hairline pl-4 text-xs leading-relaxed text-ink-2">
          {notes.map((n, i) => (
            <li key={i}>
              <span className="mr-1 font-mono text-ink-3">v. {n.verse}</span>
              {n.text}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
