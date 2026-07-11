import { type DocHeading } from "@/lib/docs";

export default function TOC({ headings }: { headings: DocHeading[] }) {
  if (headings.length < 2) return null;

  return (
    <nav className="hidden lg:block w-56 shrink-0">
      <div className="sticky top-8 space-y-3">
        <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-text-muted">
          On this page
        </h4>
        <ul className="space-y-1.5 border-l border-border-card">
          {headings.map((h) => (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                className={`
                  block text-[12px] leading-tight py-1 border-l transition-all duration-150
                  ${h.level === 2
                    ? "pl-4 -ml-[1px] border-l-accent text-text-page font-medium hover:text-accent"
                    : h.level === 3
                    ? "pl-7 -ml-[1px] border-l-transparent text-text-muted hover:text-text-page hover:border-l-text-muted"
                    : "pl-10 -ml-[1px] border-l-transparent text-text-muted/70 hover:text-text-muted hover:border-l-text-muted/50"
                  }
                `}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
