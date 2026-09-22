"use client";

import { useState } from "react";
import Link from "next/link";
import type { CccGroup, CccHit, CccParagraph } from "@/lib/types";
import { Breadcrumb } from "./Breadcrumb";
import { bibleHref } from "@/lib/links";

export function ChurchTeachingPanel({ groups }: { groups: CccGroup[] }) {
  const count = groups.reduce((n, g) => n + g.hits.length, 0);
  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between border-b hairline pb-3">
        <h2 className="font-serif text-2xl tracking-tight text-ink">Church teaching</h2>
        <span className="text-xs text-ink-3">
          {count} paragraph{count === 1 ? "" : "s"} · Catechism of the Catholic Church
        </span>
      </div>
      {groups.length === 0 && <p className="text-sm text-ink-2">No Catechism paragraphs matched this question closely enough.</p>}
      <div className="space-y-12">
        {groups.map((g) => (
          <section key={g.headingId ?? g.breadcrumb[0]?.title}>
            <Breadcrumb crumbs={g.breadcrumb.slice(0, -1)} className="mb-1" />
            <div className="mb-5 flex flex-wrap items-baseline gap-x-3">
              <h3 className="font-serif text-xl leading-snug text-ink">{g.breadcrumb[g.breadcrumb.length - 1]?.title}</h3>
              {g.range && (
                <Link href={`/ccc/${g.hits[0].n}`} className="text-xs text-ink-3 hover:text-ink">
                  ¶{g.range[0]}–{g.range[1]} · open article →
                </Link>
              )}
            </div>
            <div className="space-y-7">
              {g.hits.map((h) => (
                <ParagraphCard key={h.n} hit={h} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

const SIGNAL_LABEL: Record<CccHit["signals"][number], string> = {
  keyword: "keyword",
  semantic: "meaning",
  topic: "topic index",
  "scripture-link": "cites a matching passage",
};

function ParagraphCard({ hit }: { hit: CccHit }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [context, setContext] = useState<CccParagraph[] | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  async function loadContext() {
    if (context) {
      setContext(null);
      return;
    }
    setContextLoading(true);
    setContextError(null);
    try {
      const res = await fetch(`/api/ccc/${hit.n}?context=3`);
      if (!res.ok) throw new Error(`Could not load paragraphs (${res.status})`);
      const data = (await res.json()) as { context: CccParagraph[] };
      setContext(data.context);
    } catch (err) {
      setContextError((err as Error).message);
    } finally {
      setContextLoading(false);
    }
  }

  const hasNotes = hit.footnotes.length > 0;

  return (
    <article id={`ccc-${hit.n}`} className="scroll-mt-24">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Link href={`/ccc/${hit.n}`} className="tag">
          CCC {hit.n}
        </Link>
        <span className="text-[0.68rem] text-ink-3">
          {hit.signals.map((s) => SIGNAL_LABEL[s]).join(" · ")}
        </span>
      </div>

      {context ? (
        <div className="space-y-4 border-l hairline pl-4">
          {context.map((p) => (
            <div key={p.n} className={p.n === hit.n ? "highlight -ml-4 pl-4" : ""}>
              <span className="mr-2 font-mono text-[0.68rem] text-ink-3">{p.n}</span>
              <span className="prose-text">{p.text}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="prose-text">{hit.text}</p>
      )}

      {hit.scriptureRefs.length > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          <span className="mr-2 font-mono uppercase tracking-wider">Cites</span>
          {dedupe(hit.scriptureRefs.map((r) => ({ key: r.reference, r }))).map(({ r }, i, arr) => (
            <span key={r.reference}>
              <Link href={bibleHref(r.book, r.drChapter, r.verseStart)} className="link">
                {r.reference}
              </Link>
              {i < arr.length - 1 ? "; " : ""}
            </span>
          ))}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs">
        <button type="button" onClick={() => void loadContext()} aria-expanded={context !== null} className="link" disabled={contextLoading}>
          {contextLoading ? "Loading…" : context ? "Hide surrounding paragraphs" : "Read surrounding paragraphs"}
        </button>
        {hasNotes && (
          <button type="button" onClick={() => setNotesOpen((v) => !v)} aria-expanded={notesOpen} className="text-ink-3 hover:text-ink active:opacity-75">
            {notesOpen ? "Hide notes" : `Notes (${hit.footnotes.length})`}
          </button>
        )}
        <Link href={`/ccc/${hit.n}`} className="text-ink-3 hover:text-ink active:opacity-75">
          Full article →
        </Link>
      </div>
      {contextError && <p className="mt-2 text-xs text-accent">{contextError}</p>}
      {notesOpen && (
        <ol className="mt-3 space-y-1 border-l hairline pl-4 text-xs leading-relaxed text-ink-2">
          {hit.footnotes.map((f) => (
            <li key={f.num}>
              <span className="mr-1 font-mono text-ink-3">{f.num}</span>
              {f.text}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function dedupe<T extends { key: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
}
