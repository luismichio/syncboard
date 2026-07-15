"use client";

import { useEffect, useRef } from "react";

function getMermaidTheme() {
  const root = document.documentElement;
  const isDark = root.classList.contains("dark");
  const bgCard = getComputedStyle(root).getPropertyValue("--bg-card").trim() || (isDark ? "#121212" : "#F2EFE9");
  const textMuted = getComputedStyle(root).getPropertyValue("--text-muted").trim() || (isDark ? "#9A9997" : "#5E5E5E");
  const textPage = getComputedStyle(root).getPropertyValue("--text-page").trim() || (isDark ? "#FAF9F5" : "#0A0A0A");
  const borderCard = getComputedStyle(root).getPropertyValue("--border-card").trim() || (isDark ? "#1F1F1F" : "#E0DBD0");
  const accent = getComputedStyle(root).getPropertyValue("--accent").trim() || "#00A2C9";
  const bgPage = getComputedStyle(root).getPropertyValue("--bg-page").trim() || (isDark ? "#0A0A0A" : "#FAF9F5");

  const baseFont = "14px";

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
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      // Unified font sizes across all diagram types
      fontSize: baseFont,
      sectionFontSize: baseFont,
      actorFontSize: baseFont,
      noteFontSize: baseFont,
      messageFontSize: baseFont,
      labelFontSize: baseFont,
      stateLabelFontSize: baseFont,
      titleFontSize: baseFont,
    },
  };
}

export default function MermaidHydrator() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    let mermaidInstance: any = null;
    let observer: MutationObserver | null = null;

    async function renderDiagrams() {
      // Clear existing SVGs from diagram containers
      document.querySelectorAll<HTMLElement>(".mermaid-diagram").forEach((el) => {
        const code = el.getAttribute("data-code") || el.textContent || "";
        if (!el.hasAttribute("data-code")) {
          el.setAttribute("data-code", code);
        }
        el.innerHTML = code;
      });

      if (!mermaidInstance) {
        const mod = await import("mermaid");
        mermaidInstance = mod.default;
      }

      const config = getMermaidTheme();
      mermaidInstance.initialize({
        startOnLoad: false,
        ...config,
      });

      try {
        await mermaidInstance.run({
          querySelector: ".mermaid-diagram",
        });
      } catch (err) {
        // If render fails on first attempt, retry once after delay
        setTimeout(async () => {
          try {
            await mermaidInstance.run({
              querySelector: ".mermaid-diagram",
            });
          } catch {}
        }, 300);
      }

      // Attach click-to-zoom handlers
      document.querySelectorAll<HTMLElement>(".mermaid-diagram").forEach((el) => {
        // Remove old listener to avoid duplicates on re-render
        const oldHandler = (el as any).__zoomHandler;
        if (oldHandler) {
          el.removeEventListener("click", oldHandler);
        }
        const handler = (e: MouseEvent) => {
          e.stopPropagation();
          el.classList.toggle("zoomed");
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        };
        (el as any).__zoomHandler = handler;
        el.addEventListener("click", handler);
        el.style.cursor = "zoom-in";
      });
    }

    // Initial render
    renderDiagrams();

    // Watch for theme changes (class toggles on <html>)
    observer = new MutationObserver(() => {
      renderDiagrams();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Also listen for system color scheme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      // Only react if no explicit theme is stored (system mode)
      if (!localStorage.getItem("theme")) {
        renderDiagrams();
      }
    };
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      if (observer) observer.disconnect();
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return null;
}
