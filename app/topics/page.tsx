import type { Metadata } from "next";
import Link from "next/link";
import { listTopics } from "@/lib/topics";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Topics" };

export default function TopicsPage() {
  let topics: ReturnType<typeof listTopics> = [];
  try {
    topics = listTopics();
  } catch {
    topics = [];
  }
  const byCategory = new Map<string, typeof topics>();
  for (const t of topics) {
    if (!byCategory.has(t.category)) byCategory.set(t.category, []);
    byCategory.get(t.category)!.push(t);
  }
  return (
    <div className="mx-auto max-w-3xl pt-10 sm:pt-14">
      <p className="eyebrow mb-3">Topic index</p>
      <h1 className="font-serif text-3xl tracking-tight text-ink sm:text-4xl">Common questions, mapped to the Catechism</h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-2">
        A small, hand-curated index. Each topic points to the paragraph ranges where the Catechism treats it, so common questions land
        on the right text even when a search is phrased loosely. Open a topic to search it, or jump straight to the paragraphs.
      </p>
      {topics.length === 0 && <p className="mt-8 text-sm text-ink-3">The database has not been built yet. Run `npm run setup`.</p>}
      <div className="mt-12 space-y-12">
        {[...byCategory.entries()].map(([category, list]) => (
          <section key={category}>
            <h2 className="mb-5 border-b hairline pb-2 font-serif text-xl italic text-ink-2">{category}</h2>
            <ul className="space-y-6">
              {list.map((t) => (
                <li key={t.slug} id={t.slug} className="scroll-mt-24">
                  <Link href={`/?q=${encodeURIComponent(t.name)}`} className="link font-serif text-lg">
                    {t.name}
                  </Link>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{t.description}</p>
                  <p className="mt-1.5 text-xs text-ink-3">
                    {t.ranges.map(([a, b], i) => (
                      <span key={`${a}-${b}`}>
                        <Link href={`/ccc/${a}`} className="tag">
                          CCC {a === b ? a : `${a}–${b}`}
                        </Link>
                        {i < t.ranges.length - 1 ? "  " : ""}
                      </span>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
