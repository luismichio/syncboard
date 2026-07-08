import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0A0A0A] text-[#FAF9F5] font-sans selection:bg-[#01C8F1] selection:text-[#0A0A0A] flex flex-col justify-center items-center p-8 relative overflow-hidden">
      {/* Decorative background grid pattern */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M0 40h40V0H0v40zM39 39H1V1h38v38z' fill='%23FAF9F5'/%3E%3C/svg%3E")`,
          backgroundSize: "40px 40px",
        }}
      ></div>

      {/* Decorative gradient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#01C8F1]/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="relative z-10 text-center max-w-xl space-y-6 flex flex-col items-center">
        <header className="space-y-2">
          <div className="inline-block px-3 py-1 text-[10px] font-mono tracking-widest font-semibold border border-[#01C8F1]/40 text-[#01C8F1] rounded-full bg-[#01C8F1]/5 mb-3 animate-pulse">
            OPEN SOURCE · APACHE 2.0
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-[#FAF9F5] to-[#9A9997] bg-clip-text text-transparent">
            SyncBoard
          </h1>
          <p className="text-sm font-semibold tracking-wider font-mono uppercase text-[#01C8F1] pt-1">
            Stateless Figma-Miro Pipeline
          </p>
        </header>

        <p className="text-sm md:text-base text-[#9A9997] leading-relaxed max-w-md">
          A database-free, self-hosted integration that updates Figma frame
          screenshots inside Miro in-place with zero duplicates. Connect your
          workspace, select items on your board, and sync.
        </p>

        <div className="pt-4 flex flex-col sm:flex-row gap-4 w-full justify-center">
          <Link
            href="/dashboard"
            className="px-6 py-3 rounded-lg font-mono font-bold text-xs bg-[#01C8F1] text-[#0A0A0A] hover:bg-[#00DFF6] hover:shadow-[0_0_16px_rgba(1,200,241,0.25)] transition duration-200"
          >
            OPEN DASHBOARD
          </Link>
          <a
            href="https://github.com/luismichio/syncboard"
            target="_blank"
            rel="noreferrer"
            className="px-6 py-3 rounded-lg font-mono font-bold text-xs border border-[#5E5E5E] text-[#FAF9F5] hover:bg-[#1A1A1A] transition duration-200"
          >
            VIEW ON GITHUB
          </a>
        </div>

        <footer className="pt-12 text-[10px] text-[#5E5E5E] font-mono">
          Made for product teams. Zero data stored on server.
        </footer>
      </div>
    </main>
  );
}
