import Link from "next/link";
import { getAllDocs } from "@/lib/docs";

/** Group a doc list by category. */
interface DocMeta {
  slug: string;
  title: string;
  description: string;
  filename: string;
  size: number;
}

function categorize(slug: string): string {
  if (slug === "readme") return "Overview";
  if (slug === "setup") return "Guides";
  if (slug === "architecture" || slug === "changelog" || slug === "license") return "Reference";
  return "Other";
}

const CATEGORY_ORDER = ["Overview", "Guides", "Reference", "Other"];

export default function DocsIndexPage() {
  const rawDocs = getAllDocs();

  const grouped: Record<string, DocMeta[]> = {};
  for (const doc of rawDocs) {
    const cat = categorize(doc.slug);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(doc);
  }

  // Sort the categories
  const categories = CATEGORY_ORDER.filter((c) => grouped[c]);

  return (
    <main className="min-h-screen bg-bg-page text-text-page font-sans selection:bg-accent selection:text-bg-page relative overflow-hidden">
      {/* Decorative background grid */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M0 40h40V0H0v40zM39 39H1V1h38v38z' fill='%23FAF9F5'/%3E%3C/svg%3E")`,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Decorative glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 border-b border-border-card">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:opacity-80 transition">
              <span className="text-lg font-bold tracking-tight">SyncBoard</span>
            </Link>
            <span className="text-text-muted font-mono text-xs">/</span>
            <span className="text-sm font-mono text-accent font-semibold">docs</span>
          </div>
          <a
            href="https://github.com/luismichio/syncboard"
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-lg font-mono font-bold text-xs border border-border-card text-text-page hover:bg-bg-card transition duration-200"
          >
            VIEW ON GITHUB
          </a>
        </div>
      </header>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-16 space-y-12">
        {/* Title */}
        <div className="space-y-3">
          <div className="inline-block px-3 py-1 text-[10px] font-mono tracking-widest font-semibold border border-accent/40 text-accent rounded-full bg-accent/5">
            REFERENCE
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-text-page to-text-muted bg-clip-text text-transparent">
            Documentation
          </h1>
          <p className="text-sm text-text-muted max-w-xl leading-relaxed">
            Architecture overview, changelog, setup guides, and configuration reference for self-hosting SyncBoard.
          </p>
        </div>

        {/* Doc Cards — grouped by category */}
        {categories.map((cat) => (
          <div key={cat} className="space-y-3">
            {cat !== "Overview" && (
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-text-muted/60">
                {cat}
              </h3>
            )}
            <div className="grid gap-4">
              {grouped[cat].map((doc: DocMeta) => (
                <Link
                  key={doc.slug}
                  href={`/docs/${doc.slug}`}
                  className="group block p-6 rounded-xl border border-border-card bg-bg-card hover:border-accent/40 hover:shadow-[0_0_20px_rgba(var(--color-accent),0.08)] transition-all duration-200"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-bold text-base group-hover:text-accent transition-colors">
                          {doc.title}
                        </h2>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all">
                          <path d="M7 7h10v10"/><path d="M7 17 17 7"/>
                        </svg>
                      </div>
                      {doc.description && (
                        <p className="text-xs text-text-muted leading-relaxed line-clamp-2">
                          {doc.description}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-text-muted shrink-0 mt-1">
                      {(doc.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}

        {/* Agent note */}
        <div className="p-5 rounded-xl border border-border-card bg-bg-card/50 space-y-2">
          <p className="text-xs font-mono text-text-muted">
            <span className="text-accent font-semibold">💡 For AI agents:</span> This content is also available as raw markdown via the API:
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-text-muted">
            <code className="text-accent">GET /api/docs/list</code>
            <code className="text-accent">GET /api/docs/raw?file=&lt;filename&gt;</code>
            <code className="text-accent">GET /api/docs/raw?slug=&lt;slug&gt;</code>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border-card">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between text-[10px] font-mono text-text-muted">
          <span>AGPLv3 License</span>
          <a href="https://github.com/luismichio/syncboard" target="_blank" rel="noreferrer" className="hover:text-text-page transition">
            github.com/luismichio/syncboard
          </a>
        </div>
      </footer>
    </main>
  );
}
