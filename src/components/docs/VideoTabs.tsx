"use client";

import { useState } from "react";

interface VideoTabsProps {
  figma?: string;
  penpot?: string;
}

export default function VideoTabs({ figma, penpot }: VideoTabsProps) {
  const [activeTab, setActiveTab] = useState<"figma" | "penpot">("figma");

  const renderContent = (src?: string, title?: string) => {
    if (!src || src === "coming-soon") {
      return (
        <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed border-border-card bg-bg-card p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-text-muted text-center">Video Walkthrough Coming Soon</p>
        </div>
      );
    }
    return (
      <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-border-card bg-bg-card shadow-sm">
        <iframe
          className="h-full w-full"
          src={src}
          title={title || "Video Demo"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  };

  return (
    <div className="my-6 border border-border-card bg-bg-card rounded-xl overflow-hidden shadow-sm transition-all">
      <div className="flex items-center border-b border-border-card bg-bg-page/50 px-3 py-2 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("figma")}
          className={`px-3.5 py-1.5 rounded-lg font-mono text-xs font-semibold transition cursor-pointer select-none ${
            activeTab === "figma"
              ? "bg-accent/15 text-accent border border-accent/30"
              : "text-text-muted hover:text-text-page border border-transparent"
          }`}
        >
          Figma Demo
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("penpot")}
          className={`px-3.5 py-1.5 rounded-lg font-mono text-xs font-semibold transition cursor-pointer select-none ${
            activeTab === "penpot"
              ? "bg-accent/15 text-accent border border-accent/30"
              : "text-text-muted hover:text-text-page border border-transparent"
          }`}
        >
          Penpot Demo
        </button>
      </div>
      <div className="p-1">
        {activeTab === "figma" && renderContent(figma, "Figma Companion Demo")}
        {activeTab === "penpot" && renderContent(penpot, "Penpot Companion Demo")}
      </div>
    </div>
  );
}
