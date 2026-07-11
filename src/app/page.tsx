import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default function Home() {
  return (
    <main className="min-h-screen bg-bg-page text-text-page font-sans selection:bg-accent selection:text-bg-page flex flex-col justify-center items-center p-8 relative overflow-hidden">
      {/* Theme Toggle in top-right */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      {/* Decorative background grid pattern */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M0 40h40V0H0v40zM39 39H1V1h38v38z' fill='%23FAF9F5'/%3E%3C/svg%3E")`,
          backgroundSize: "40px 40px",
        }}
      ></div>

      {/* Decorative gradient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="relative z-10 text-center max-w-xl space-y-6 flex flex-col items-center">
        <header className="space-y-2">
          <div className="inline-block px-3 py-1 text-[10px] font-mono tracking-widest font-semibold border border-accent/40 text-accent rounded-full bg-accent/5 mb-3 animate-pulse">
            OPEN SOURCE · APACHE 2.0
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-text-page to-text-muted bg-clip-text text-transparent">
            SyncBoard
          </h1>
          <p className="text-sm font-semibold tracking-wider font-mono uppercase text-accent pt-1">
            Stateless Figma-Miro Pipeline
          </p>
        </header>

        <p className="text-sm md:text-base text-text-muted leading-relaxed max-w-md">
          A database-free, self-hosted integration that updates Figma frame
          screenshots inside Miro in-place with zero duplicates. Connect your
          workspace, select items on your board, and sync.
        </p>

        <div className="pt-4 flex flex-col sm:flex-row gap-4 w-full justify-center">
          <Link
            href="/docs"
            className="px-6 py-3 rounded-lg font-mono font-bold text-xs bg-accent text-bg-page hover:opacity-90 hover:shadow-[0_0_16px_rgba(var(--color-accent),0.25)] transition duration-200"
          >
            DOCUMENTATION
          </Link>
          <a
            href="https://github.com/luismichio/syncboard"
            target="_blank"
            rel="noreferrer"
            className="px-6 py-3 rounded-lg font-mono font-bold text-xs border border-border-card text-text-page hover:bg-bg-card transition duration-200"
          >
            VIEW ON GITHUB
          </a>
        </div>

        <footer className="pt-12 text-[10px] text-text-muted font-mono">
          Made for product teams. Zero data stored on server.
        </footer>
      </div>
    </main>
  );
}
