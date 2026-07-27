"use client";

import { useEffect } from "react";

export default function CodeCopyHydrator() {
  useEffect(() => {
    const preBlocks = document.querySelectorAll<HTMLPreElement>(".doc-content pre");

    preBlocks.forEach((pre) => {
      // Skip if copy button already exists or if it's a mermaid container
      if (pre.querySelector(".code-copy-btn") || pre.classList.contains("mermaid-diagram")) {
        return;
      }

      pre.style.position = "relative";

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className =
        "code-copy-btn absolute top-3.5 right-3.5 px-2.5 py-1 rounded-md text-[11px] font-mono bg-bg-card/90 border border-border-card text-text-muted hover:text-text-page hover:border-accent/40 transition duration-200 select-none cursor-pointer z-10 opacity-70 hover:opacity-100";
      copyBtn.innerText = "Copy";
      copyBtn.setAttribute("aria-label", "Copy code to clipboard");

      copyBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const codeElement = pre.querySelector("code") || pre;
        const codeText = codeElement.textContent || "";

        try {
          await navigator.clipboard.writeText(codeText);
          copyBtn.innerText = "Copied!";
          copyBtn.classList.add("text-accent", "font-semibold", "border-accent/60");
          setTimeout(() => {
            copyBtn.innerText = "Copy";
            copyBtn.classList.remove("text-accent", "font-semibold", "border-accent/60");
          }, 2000);
        } catch (err) {
          console.error("Failed to copy code:", err);
        }
      });

      pre.appendChild(copyBtn);
    });
  }, []);

  return null;
}
