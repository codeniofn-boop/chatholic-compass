/** Questions the user flagged as "couldn't find what I was looking for". Browser-only (localStorage). */
const KEY = "cc-missed";
const MAX = 200;

export interface MissedEntry {
  query: string;
  at: number;
  note?: string;
}

const EMPTY: MissedEntry[] = [];
let cache: MissedEntry[] | null = null;
const listeners = new Set<() => void>();

function read(): MissedEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as MissedEntry[];
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e.query === "string") : EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(next: MissedEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: nothing else to do
  }
  cache = next;
  for (const l of listeners) l();
}

export function getMissedSnapshot(): MissedEntry[] {
  if (cache === null) cache = read();
  return cache;
}

export function getServerMissedSnapshot(): MissedEntry[] {
  return EMPTY;
}

export function subscribeMissed(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function isMissed(query: string): boolean {
  const q = query.trim().toLowerCase();
  return getMissedSnapshot().some((e) => e.query.toLowerCase() === q);
}

export function addMissed(query: string, note?: string): void {
  const q = query.trim();
  if (!q) return;
  const rest = getMissedSnapshot().filter((e) => e.query.toLowerCase() !== q.toLowerCase());
  write([{ query: q, at: Date.now(), ...(note ? { note } : {}) }, ...rest].slice(0, MAX));
}

export function removeMissed(query: string): void {
  write(getMissedSnapshot().filter((e) => e.query !== query));
}

export function clearMissed(): void {
  write(EMPTY);
}
