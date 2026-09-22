import type { Metadata } from "next";
import { MissedList } from "@/components/MissedList";

export const metadata: Metadata = { title: "Missed questions" };

export default function MissedPage() {
  return (
    <div className="mx-auto max-w-2xl pt-10 sm:pt-14">
      <p className="eyebrow mb-3">Missed questions</p>
      <h1 className="font-serif text-3xl tracking-tight text-ink sm:text-4xl">Questions the search did not answer well</h1>
      <p className="mt-4 text-base leading-relaxed text-ink-2">
        Saved in this browser when you press &ldquo;I couldn&apos;t find what I was looking for&rdquo; under a result. Turn them into new
        evaluation cases by adding the expected paragraphs and appending them to <code className="font-mono text-sm">data/eval/questions.json</code>.
      </p>
      <MissedList />
    </div>
  );
}
