import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getChapter } from "@/lib/bible";
import { findBook } from "@/lib/bible-books";

export const dynamic = "force-dynamic";

/** GET /api/bible/MAT/5  (book code or name; chapter in Douay-Rheims numbering) */
export async function GET(_request: Request, ctx: { params: Promise<{ book: string; chapter: string }> }): Promise<Response> {
  const { book: rawBook, chapter: rawChapter } = await ctx.params;
  const book = findBook(decodeURIComponent(rawBook));
  const chapter = Number(rawChapter);
  if (!book || !Number.isInteger(chapter) || chapter < 1) return NextResponse.json({ error: "Unknown book or chapter" }, { status: 400 });
  const data = getChapter(getDb(), book.code, chapter);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=3600" } });
}
