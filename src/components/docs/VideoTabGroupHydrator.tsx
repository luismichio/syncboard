"use client";

import { useEffect } from "react";

export default function VideoTabGroupHydrator() {
  useEffect(() => {
    const docContent = document.querySelector(".doc-content");
    if (!docContent) return;

    const h3Elements = Array.from(docContent.querySelectorAll<HTMLHeadingElement>("h3"));

    for (let i = 0; i < h3Elements.length - 1; i++) {
      const figmaH3 = h3Elements[i];
      const penpotH3 = h3Elements[i + 1];

      const figmaText = (figmaH3.textContent || "").trim().toLowerCase();
      const penpotText = (penpotH3.textContent || "").trim().toLowerCase();

      const isFigmaWalkthrough =
        figmaText.includes("figma") &&
        (figmaText.includes("walkthrough") || figmaText.includes("demo") || figmaText.includes("setup"));
      const isPenpotWalkthrough =
        penpotText.includes("penpot") &&
        (penpotText.includes("walkthrough") || penpotText.includes("demo") || penpotText.includes("setup"));

      if (!isFigmaWalkthrough || !isPenpotWalkthrough) continue;

      const figmaNode = figmaH3.nextElementSibling as HTMLElement | null;
      const penpotNode = penpotH3.nextElementSibling as HTMLElement | null;

      if (!figmaNode || figmaNode === penpotH3) continue;
      if (!penpotNode || penpotNode.tagName === "H2" || penpotNode.tagName === "H3" || penpotNode.tagName === "HR") continue;

      if (figmaH3.dataset.tabHydrated === "true") continue;
      figmaH3.dataset.tabHydrated = "true";
      penpotH3.dataset.tabHydrated = "true";

      figmaH3.style.display = "none";
      penpotH3.style.display = "none";

      const figmaWrapper = figmaNode.cloneNode(true) as HTMLElement;
      const penpotWrapper = penpotNode.cloneNode(true) as HTMLElement;

      figmaNode.style.display = "none";
      penpotNode.style.display = "none";

      const container = document.createElement("div");
      container.className =
        "my-6 border border-border-card bg-bg-card rounded-xl overflow-hidden shadow-sm transition-all";

      const tabBar = document.createElement("div");
      tabBar.className =
        "flex items-center border-b border-border-card bg-bg-page/50 px-3 py-2 gap-2";

      const figmaTabBtn = document.createElement("button");
      figmaTabBtn.type = "button";
      figmaTabBtn.className =
        "px-3.5 py-1.5 rounded-lg font-mono text-xs font-semibold transition bg-accent/15 text-accent border border-accent/30 cursor-pointer select-none";
      figmaTabBtn.innerText = "Figma Demo";

      const penpotTabBtn = document.createElement("button");
      penpotTabBtn.type = "button";
      penpotTabBtn.className =
        "px-3.5 py-1.5 rounded-lg font-mono text-xs font-semibold transition text-text-muted hover:text-text-page cursor-pointer select-none";
      penpotTabBtn.innerText = "Penpot Demo";

      const contentArea = document.createElement("div");
      contentArea.className = "p-1";

      figmaWrapper.style.display = "block";
      penpotWrapper.style.display = "none";

      contentArea.appendChild(figmaWrapper);
      contentArea.appendChild(penpotWrapper);

      figmaTabBtn.addEventListener("click", () => {
        figmaTabBtn.className =
          "px-3.5 py-1.5 rounded-lg font-mono text-xs font-semibold transition bg-accent/15 text-accent border border-accent/30 cursor-pointer select-none";
        penpotTabBtn.className =
          "px-3.5 py-1.5 rounded-lg font-mono text-xs font-semibold transition text-text-muted hover:text-text-page cursor-pointer select-none";
        figmaWrapper.style.display = "block";
        penpotWrapper.style.display = "none";
      });

      penpotTabBtn.addEventListener("click", () => {
        penpotTabBtn.className =
          "px-3.5 py-1.5 rounded-lg font-mono text-xs font-semibold transition bg-accent/15 text-accent border border-accent/30 cursor-pointer select-none";
        figmaTabBtn.className =
          "px-3.5 py-1.5 rounded-lg font-mono text-xs font-semibold transition text-text-muted hover:text-text-page cursor-pointer select-none";
        figmaWrapper.style.display = "none";
        penpotWrapper.style.display = "block";
      });

      tabBar.appendChild(figmaTabBtn);
      tabBar.appendChild(penpotTabBtn);

      container.appendChild(tabBar);
      container.appendChild(contentArea);

      figmaH3.parentNode?.insertBefore(container, figmaH3);
    }
  }, []);

  return null;
}
