import { getDb } from "./db";

export interface TopicSummary {
  slug: string;
  name: string;
  category: string;
  description: string;
  ranges: [number, number][];
}

export function listTopics(): TopicSummary[] {
  const rows = getDb()
    .prepare("SELECT slug, name, category, description, ranges FROM topics ORDER BY category, name")
    .all() as { slug: string; name: string; category: string; description: string; ranges: string }[];
  return rows.map((r) => ({ ...r, ranges: JSON.parse(r.ranges) as [number, number][] }));
}
