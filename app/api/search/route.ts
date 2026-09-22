import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { search } from "@/lib/search";

export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 300;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ error: "Missing query parameter q" }, { status: 400 });
  if (q.length > MAX_QUERY_LENGTH) return NextResponse.json({ error: `Query longer than ${MAX_QUERY_LENGTH} characters` }, { status: 400 });
  const cccLimit = clamp(Number(url.searchParams.get("ccc") ?? 10), 1, 30);
  const bibleLimit = clamp(Number(url.searchParams.get("bible") ?? 8), 1, 30);
  try {
    const result = await search(getDb(), q, { cccLimit, bibleLimit });
    return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (err) {
    console.error("search failed", err);
    return NextResponse.json({ error: "Search failed. Has the database been built (npm run setup)?" }, { status: 500 });
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : lo;
}
