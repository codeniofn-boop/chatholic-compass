"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { clearMissed, getMissedSnapshot, getServerMissedSnapshot, removeMissed, subscribeMissed } from "@/lib/missed";

export function MissedList() {
  const missed = useSyncExternalStore(subscribeMissed, getMissedSnapshot, getServerMissedSnapshot);
  const [copied, setCopied] = useState(false);

  const evalStub = JSON.stringify(
    missed.map((m, i) => ({ id: `missed-${i + 1}`, question: m.query, expectedCcc: [], expectedBible: [] })),
    null,
    2,
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(evalStub);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable: the textarea below can be selected by hand
    }
  }

  if (missed.length === 0) {
    return <p className="mt-10 text-sm text-ink-3">Nothing saved yet.</p>;
  }

  return (
    <div className="mt-10">
      <div className="mb-4 flex items-baseline justify-between border-b hairline pb-2 text-xs text-ink-3">
        <span>
          {missed.length} question{missed.length === 1 ? "" : "s"}
        </span>
        <span className="flex gap-4">
          <button type="button" onClick={() => void copy()} className="link">
            {copied ? "Copied" : "Copy as eval JSON"}
          </button>
          <button type="button" onClick={() => clearMissed()} className="text-ink-3 hover:text-ink active:opacity-75">
            Clear all
          </button>
        </span>
      </div>
      <ul className="space-y-4">
        {missed.map((m) => (
          <li key={m.at} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <Link href={`/?q=${encodeURIComponent(m.query)}`} className="link font-serif text-lg">
              {m.query}
            </Link>
            <span className="flex items-baseline gap-4 text-xs text-ink-3">
              <time dateTime={new Date(m.at).toISOString()}>{new Date(m.at).toLocaleDateString()}</time>
              <button type="button" onClick={() => removeMissed(m.query)} className="hover:text-ink active:opacity-75">
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
      <details className="mt-10 text-xs text-ink-3">
        <summary className="cursor-pointer hover:text-ink">Eval JSON</summary>
        <textarea readOnly value={evalStub} rows={Math.min(24, missed.length * 6 + 2)} className="mt-3 w-full border hairline bg-paper-2 p-3 font-mono text-[0.7rem] text-ink-2" />
      </details>
    </div>
  );
}
