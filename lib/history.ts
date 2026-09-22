/** Search history, kept only in the browser (localStorage). No accounts, nothing sent anywhere. */
const KEY = "cc-history";
const MAX = 20;

export interface HistoryEntry {
  query: string;
  at: number;
}

const EMPTY: HistoryEntry[] = [];
let cache: HistoryEntry[] | null = null;
const listeners = new Set<() => void>();

function read(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e.query === "string") : EMPTY;
  } catch {
    return EMPTY;
  }
}

function notify() {
  for (const l of listeners) l();
}

/** Snapshot for useSyncExternalStore (referentially stable until the history changes). */
export function getHistorySnapshot(): HistoryEntry[] {
  if (cache === null) cache = read();
  return cache;
}

export function getServerHistorySnapshot(): HistoryEntry[] {
  return EMPTY;
}

export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
      cache = null;
      notify();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function pushHistory(query: string): void {
  const q = query.trim();
  const next = [{ query: q, at: Date.now() }, ...getHistorySnapshot().filter((e) => e.query.toLowerCase() !== q.toLowerCase())].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode, quota): history is a convenience only
  }
  cache = next;
  notify();
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  cache = EMPTY;
  notify();
}
