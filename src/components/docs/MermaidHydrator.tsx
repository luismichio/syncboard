"use client";

import { useEffect, useRef, useState } from "react";
import type mermaid from "mermaid";

type ZoomableHTMLElement = HTMLElement & { __zoomHandler?: () => void };

function getMermaidTheme() {
  const root = document.documentElement;
  const isDark = root.classList.contains("dark");
  const bgCard = getComputedStyle(root).getPropertyValue("--bg-card").trim() || (isDark ? "#121212" : "#F2EFE9");
  const textMuted = getComputedStyle(root).getPropertyValue("--text-muted").trim() || (isDark ? "#9A9997" : "#5E5E5E");
  const textPage = getComputedStyle(root).getPropertyValue("--text-page").trim() || (isDark ? "#FAF9F5" : "#0A0A0A");
  const borderCard = getComputedStyle(root).getPropertyValue("--border-card").trim() || (isDark ? "#1F1F1F" : "#E0DBD0");
  const bgPage = getComputedStyle(root).getPropertyValue("--bg-page").trim() || (isDark ? "#0A0A0A" : "#FAF9F5");

  return {
    theme: "base" as const,
    themeVariables: {
      background: bgPage,
      primaryColor: bgCard,
      primaryTextColor: textPage,
      primaryBorderColor: borderCard,
      lineColor: textMuted,
      secondaryColor: bgCard,
      tertiaryColor: bgCard,
      clusterBkg: bgPage,
      clusterBorder: borderCard,
      edgeLabelBackground: bgCard,
      nodeBorder: borderCard,
      nodeTextColor: textPage,
      titleColor: textPage,
      fontSize: "14px",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    },
  };
}

export default function MermaidHydrator() {
  const initialized = useRef(false);
  const [zoomSvg, setZoomSvg] = useState<string | null>(null);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    let mermaidInstance: typeof mermaid | null = null;
    let observer: MutationObserver | null = null;

    async function renderDiagrams() {
      // Clear existing SVGs from diagram containers
      document.querySelectorAll<HTMLElement>(".mermaid-diagram").forEach((el) => {
        const code = el.getAttribute("data-code") || el.textContent || "";
        if (!el.hasAttribute("data-code")) {
          el.setAttribute("data-code", code);
        }
        el.textContent = code;
      });

      if (!mermaidInstance) {
        const mod = await import("mermaid");
        mermaidInstance = mod.default;
      }

      const instance = mermaidInstance;
      if (!instance) return;

      const config = getMermaidTheme();
      instance.initialize({
        startOnLoad: false,
        ...config,
      });

      try {
        await instance.run({
          querySelector: ".mermaid-diagram",
        });
      } catch {
        setTimeout(async () => {
          try {
            await instance.run({
              querySelector: ".mermaid-diagram",
            });
          } catch {}
        }, 300);
      }

      // Attach click-to-zoom handlers
      document.querySelectorAll<HTMLElement>(".mermaid-diagram").forEach((el) => {
        const zoomableEl = el as ZoomableHTMLElement;
        const oldHandler = zoomableEl.__zoomHandler;
        if (oldHandler) el.removeEventListener("click", oldHandler);

        const handler = () => {
          const svg = el.querySelector("svg");
          if (svg) {
            const cloned = svg.cloneNode(true) as SVGElement;
            cloned.setAttribute("width", "90vw");
            cloned.setAttribute("height", "auto");
            cloned.style.maxWidth = "90vw";
            cloned.style.maxHeight = "85vh";
            setZoomSvg(cloned.outerHTML);
          }
        };
        zoomableEl.__zoomHandler = handler;
        el.addEventListener("click", handler);
        el.style.cursor = "zoom-in";
      });
    }

    // Initial render
    renderDiagrams();

    // Watch for theme changes
    observer = new MutationObserver(() => renderDiagrams());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (!localStorage.getItem("theme")) renderDiagrams();
    };
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      if (observer) observer.disconnect();
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  // Keyboard escape to close zoom
  useEffect(() => {
    if (!zoomSvg) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomSvg(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zoomSvg]);

  return (
    <>
      {zoomSvg && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
          onClick={() => setZoomSvg(null)}
        >
          <div
            className="bg-bg-card rounded-xl p-6 max-w-[95vw] max-h-[90vh] overflow-auto"
            style={{ cursor: "zoom-out" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="mermaid-zoom"
              dangerouslySetInnerHTML={{ __html: zoomSvg }}
            />
          </div>
        </div>
      )}
    </>
  );
}
