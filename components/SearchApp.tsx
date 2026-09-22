"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { SearchResponse } from "@/lib/types";
import type { TopicSummary } from "@/lib/topics";
import { clearHistory, getHistorySnapshot, getServerHistorySnapshot, pushHistory, subscribeHistory } from "@/lib/history";
import { SearchBox } from "./SearchBox";
import { ChurchTeachingPanel } from "./ChurchTeachingPanel";
import { ScripturePanel } from "./ScripturePanel";

const EXAMPLES = [
  "What does the Church teach about IVF?",
  "Is it a sin to skip Mass?",
  "Where does the Bible talk about forgiveness?",
  "What is purgatory?",
  "Do I have to follow my conscience even if it is wrong?",
  "What are the conditions for a just war?",
];

interface Props {
  initialQuery: string;
  initialResult: SearchResponse | null;
  initialError: string | null;
  topics: TopicSummary[];
}

export function SearchApp({ initialQuery, initialResult, initialError, topics }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<SearchResponse | null>(initialResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const history = useSyncExternalStore(subscribeHistory, getHistorySnapshot, getServerHistorySnapshot);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setQuery(trimmed);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
      const data = (await res.json()) as SearchResponse | { error: string };
      if (!res.ok || "error" in data) throw new Error("error" in data ? data.error : `Request failed (${res.status})`);
      setResult(data);
      pushHistory(trimmed);
      const url = new URL(window.location.href);
      url.searchParams.set("q", trimmed);
      window.history.replaceState(null, "", url.toString());
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  // A query that arrived in the URL was searched on the server; just record it in the local history.
  useEffect(() => {
    if (initialQuery && initialResult) pushHistory(initialQuery);
  }, [initialQuery, initialResult]);

  const hasResults = result !== null;

  return (
    <div className={hasResults ? "pt-8 sm:pt-10" : "pt-16 sm:pt-28"}>
      <section className={`mx-auto transition-all ${hasResults ? "max-w-6xl" : "max-w-2xl"}`}>
        {!hasResults && (
          <div className="mb-10 text-center">
            <p className="eyebrow mb-4">Catechism · Scripture · Sources</p>
            <h1 className="font-serif text-4xl leading-tight tracking-tight text-ink sm:text-5xl">What does the Church teach?</h1>
            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-ink-2">
              Ask in plain language. You get the relevant paragraphs of the Catechism and the passages of Scripture they rest on,
              in full, with their references.
            </p>
          </div>
        )}
        <SearchBox value={query} onChange={setQuery} onSubmit={() => void runSearch(query)} loading={loading} compact={hasResults} autoFocus={!initialQuery} />
        {error && (
          <p role="alert" className="mt-4 text-sm text-accent">
            {error}
          </p>
        )}
      </section>

      {!hasResults && (
        <section className="mx-auto mt-12 max-w-2xl">
          <div className="grid gap-10 sm:grid-cols-2">
            <div>
              <p className="eyebrow mb-3">Try asking</p>
              <ul className="space-y-2">
                {EXAMPLES.map((ex) => (
                  <li key={ex}>
                    <button type="button" onClick={() => void runSearch(ex)} className="link text-left font-serif text-[1.05rem] leading-snug">
                      {ex}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-3 flex items-baseline justify-between">
                <p className="eyebrow">Recent</p>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => clearHistory()}
                    className="text-xs text-ink-3 hover:text-ink active:opacity-75"
                  >
                    Clear
                  </button>
                )}
              </div>
              {history.length > 0 ? (
                <ul className="space-y-2">
                  {history.slice(0, 8).map((h) => (
                    <li key={h.at}>
                      <button type="button" onClick={() => void runSearch(h.query)} className="link text-left font-serif text-[1.05rem] leading-snug">
                        {h.query}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm leading-relaxed text-ink-3">Your searches are kept in this browser only. Nothing is stored on a server.</p>
              )}
            </div>
          </div>

          {topics.length > 0 && (
            <div className="mt-14 border-t hairline pt-8">
              <div className="mb-4 flex items-baseline justify-between">
                <p className="eyebrow">Browse by topic</p>
                <Link href="/topics" className="text-xs text-ink-3 hover:text-ink">
                  All topics →
                </Link>
              </div>
              <TopicIndex topics={topics} onPick={(t) => void runSearch(t.name)} />
            </div>
          )}
        </section>
      )}

      {hasResults && result && (
        <section className="mt-8">
          {result.topics.length > 0 && (
            <div className="mb-8 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
              <span className="eyebrow">Topics</span>
              {result.topics.map((t) => (
                <Link key={t.slug} href={`/topics#${t.slug}`} className="link font-serif text-base" title={t.description}>
                  {t.name}
                </Link>
              ))}
            </div>
          )}

          <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-7">
              <ChurchTeachingPanel groups={result.churchTeaching} />
            </div>
            <div className="lg:col-span-5 lg:border-l lg:hairline lg:pl-10">
              <ScripturePanel groups={result.scripture} />
            </div>
          </div>

          <p className="mt-16 text-xs text-ink-3">
            Ranked locally by keyword match, semantic similarity, the topic index and the Catechism&apos;s own citations · {result.timings.embedMs + result.timings.searchMs} ms
          </p>
        </section>
      )}
    </div>
  );
}

export function TopicIndex({ topics, onPick }: { topics: TopicSummary[]; onPick: (t: TopicSummary) => void }) {
  const byCategory = new Map<string, TopicSummary[]>();
  for (const t of topics) {
    if (!byCategory.has(t.category)) byCategory.set(t.category, []);
    byCategory.get(t.category)!.push(t);
  }
  return (
    <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
      {[...byCategory.entries()].map(([category, list]) => (
        <div key={category}>
          <p className="mb-2 font-serif text-sm italic text-ink-2">{category}</p>
          <ul className="space-y-1">
            {list.map((t) => (
              <li key={t.slug}>
                <button type="button" onClick={() => onPick(t)} className="text-left text-sm text-ink-2 transition hover:text-accent-2 active:opacity-75">
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
