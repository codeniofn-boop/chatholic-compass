import type { Crumb } from "@/lib/types";

export function Breadcrumb({ crumbs, className = "" }: { crumbs: Crumb[]; className?: string }) {
  return (
    <ol className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-ink-3 ${className}`}>
      {crumbs.map((c, i) => (
        <li key={`${c.level}-${i}`} className="flex items-baseline gap-x-2">
          {i > 0 && <span aria-hidden="true">›</span>}
          <span>
            <span className="font-mono uppercase tracking-wider">{c.label}</span>
            <span className="text-ink-2"> {c.title}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
