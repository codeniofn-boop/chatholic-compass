const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with", "nor", "from"]);

/** "THE FIFTH COMMANDMENT" -> "The Fifth Commandment" (keeps quotes and hyphens). */
export function titleCase(input: string): string {
  const words = input.toLowerCase().split(/(\s+)/);
  let first = true;
  return words
    .map((w) => {
      if (/^\s+$/.test(w) || w === "") return w;
      const lead = w.match(/^["'(“‘-]*/)?.[0] ?? "";
      const core = w.slice(lead.length);
      const cap = (s: string) => s.replace(/^[a-z]/, (c) => c.toUpperCase()).replace(/-([a-z])/g, (_, c: string) => "-" + c.toUpperCase());
      const out = !first && SMALL_WORDS.has(core.replace(/[^a-z]/g, "")) ? core : cap(core);
      first = false;
      return lead + out;
    })
    .join("")
    .replace(/\bGod's\b/g, "God's")
    .replace(/\bI Believe\b/g, "I Believe")
    .replace(/\b(Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi|Xii)\b/g, (m) => m.toUpperCase());
}

export function truncate(text: string, max = 280): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trimEnd() + "…";
}
