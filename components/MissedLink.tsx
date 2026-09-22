"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { addMissed, getMissedSnapshot, getServerMissedSnapshot, removeMissed, subscribeMissed } from "@/lib/missed";

export function MissedLink({ query }: { query: string }) {
  const missed = useSyncExternalStore(subscribeMissed, getMissedSnapshot, getServerMissedSnapshot);
  const flagged = missed.some((e) => e.query.toLowerCase() === query.trim().toLowerCase());
  return (
    <p className="text-xs text-ink-3">
      {flagged ? (
        <>
          Saved to your{" "}
          <Link href="/missed" className="link">
            missed questions
          </Link>
          .{" "}
          <button type="button" onClick={() => removeMissed(query.trim())} className="text-ink-3 hover:text-ink active:opacity-75">
            Undo
          </button>
        </>
      ) : (
        <button type="button" onClick={() => addMissed(query)} className="link">
          I couldn&apos;t find what I was looking for
        </button>
      )}
    </p>
  );
}
