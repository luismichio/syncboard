"use client";

import { useEffect, useRef } from "react";

export default function MermaidHydrator() {
  const initialized = useRef(false);
  const rendered = useRef(false);

  useEffect(() => {
    if (rendered.current) return;
    rendered.current = true;

    async function init() {
      if (initialized.current) return;
      initialized.current = true;

      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        themeVariables: {
          primaryColor: "#1e293b",
          primaryTextColor: "#e2e8f0",
          primaryBorderColor: "#334155",
          lineColor: "#475569",
          secondaryColor: "#0f172a",
          tertiaryColor: "#1e293b",
          clusterBkg: "#0f172a",
          clusterBorder: "#334155",
          edgeLabelBackground: "#1e293b",
          nodeBorder: "#334155",
          fontSize: "13px",
        },
      });

      try {
        await mermaid.run({
          querySelector: ".mermaid-diagram",
        });
      } catch (err) {
        console.warn("Mermaid render error:", err);
      }
    }

    // Small delay to ensure DOM is settled, then retry once if needed
    const id = setTimeout(() => {
      init().catch(() => {
        // Retry once after a longer delay
        setTimeout(() => init(), 500);
      });
    }, 100);

    return () => clearTimeout(id);
  }, []);

  return null;
}
