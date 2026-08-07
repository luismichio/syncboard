import { VersionStamp } from "@/components/VersionStamp";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <footer
        style={{
          marginTop: "4rem",
          padding: "1rem 0",
          textAlign: "center",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          borderTop: "1px solid var(--border-card)",
        }}
      >
        SyncingBoard <VersionStamp />
      </footer>
    </>
  );
}
