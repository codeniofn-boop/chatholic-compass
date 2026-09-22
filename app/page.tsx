import type { Metadata } from "next";
import { SearchApp } from "@/components/SearchApp";
import { getDb } from "@/lib/db";
import { search } from "@/lib/search";
import { listTopics } from "@/lib/topics";
import type { SearchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `${q} · Catechism Compass` : "Catechism Compass — what the Church teaches, with sources" };
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const initialQuery = typeof q === "string" ? q.trim().slice(0, 300) : "";
  let topics: Awaited<ReturnType<typeof listTopics>> = [];
  let initialResult: SearchResponse | null = null;
  let initialError: string | null = null;
  try {
    topics = listTopics();
    // A shared link (/?q=...) renders its results on the server, so the page arrives complete.
    if (initialQuery) initialResult = await search(getDb(), initialQuery);
  } catch (err) {
    initialError = initialQuery ? "Search is unavailable: the database has not been built yet (run `npm run setup`)." : null;
    console.error("home page search failed", err);
  }
  return <SearchApp initialQuery={initialQuery} initialResult={initialResult} initialError={initialError} topics={topics} />;
}
