import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getContext, getParagraph, getRelated } from "@/lib/ccc";

export const dynamic = "force-dynamic";

/**
 * GET /api/ccc/2270            -> the paragraph with footnotes and Scripture references
 * GET /api/ccc/2270?context=3  -> plus 3 paragraphs before/after, clipped to its article
 */
export async function GET(request: Request, ctx: { params: Promise<{ n: string }> }): Promise<Response> {
  const { n: raw } = await ctx.params;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 2865) return NextResponse.json({ error: "Paragraph number must be 1–2865" }, { status: 400 });
  const url = new URL(request.url);
  const context = Math.min(10, Math.max(0, Number(url.searchParams.get("context") ?? 0) || 0));
  const db = getDb();
  const paragraph = getParagraph(db, n);
  if (!paragraph) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { paragraphs, unit } = context ? getContext(db, n, context, context) : { paragraphs: [paragraph], unit: null };
  return NextResponse.json(
    { paragraph, context: paragraphs, unit, related: getRelated(db, n) },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
