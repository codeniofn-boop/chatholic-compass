"use client";

import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  compact?: boolean;
  autoFocus?: boolean;
}

export function SearchBox({ value, onChange, onSubmit, loading, compact, autoFocus }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="relative w-full"
    >
      <label htmlFor="q" className="sr-only">
        Ask what the Church teaches
      </label>
      <div className="group relative border-b border-line-2 transition-colors focus-within:border-ink">
        <input
          ref={ref}
          id="q"
          name="q"
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="What does the Church teach about…"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          className={`w-full bg-transparent py-3 pr-20 font-serif text-ink placeholder:text-ink-3 focus:outline-none ${
            compact ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl"
          }`}
          style={{ outline: "none" }}
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="absolute right-0 top-1/2 -translate-y-1/2 text-sm tracking-wide text-ink-2 transition hover:text-accent-2 active:opacity-75 disabled:cursor-default disabled:opacity-40 disabled:hover:text-ink-2"
        >
          {loading ? "Searching…" : "Search ↵"}
        </button>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-px left-0 h-px w-0 bg-accent transition-all duration-300 group-focus-within:w-full"
        />
      </div>
      {loading && (
        <div aria-hidden="true" className="absolute -bottom-px left-0 h-px w-full overflow-hidden">
          <div className="progress-bar h-full w-1/3 bg-accent" />
        </div>
      )}
    </form>
  );
}
