'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export function QuickStartSection() {
  const [activeTab, setActiveTab] = useState<'community' | 'selfhosted'>('community');

  const vercelDeployUrl =
    'https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fluismichio%2Fsyncboard&env=FIGMA_CLIENT_ID,FIGMA_CLIENT_SECRET,MIRO_CLIENT_ID,MIRO_CLIENT_SECRET,ABLY_API_KEY,UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN&project-name=syncboard&repository-name=syncboard';

  return (
    <div className="mb-14 rounded-2xl border border-border-card bg-bg-card/70 p-6 md:p-8 backdrop-blur-md shadow-sm transition-all">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-border-card">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" aria-hidden="true" />
            <h2 className="text-xl font-extrabold tracking-tight text-text-page">Quick Start Guide</h2>
          </div>
          <p className="text-xs text-text-muted font-sans">
            Choose your deployment mode to get SyncBoard up and running in minutes.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex rounded-xl bg-bg-page/80 p-1 border border-border-card shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('community')}
            className={`px-4 py-2 rounded-lg font-mono text-xs font-bold transition cursor-pointer select-none ${
              activeTab === 'community'
                ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
                : 'text-text-muted hover:text-text-page'
            }`}
          >
            Community (Hosted)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('selfhosted')}
            className={`px-4 py-2 rounded-lg font-mono text-xs font-bold transition cursor-pointer select-none ${
              activeTab === 'selfhosted'
                ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
                : 'text-text-muted hover:text-text-page'
            }`}
          >
            Self-Hosted (Vercel)
          </button>
        </div>
      </div>

      {/* Tab 1: Community (Cloud Hosted) */}
      {activeTab === 'community' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Step 1 */}
            <div className="p-4 rounded-xl bg-bg-page/50 border border-border-card/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center justify-center h-6 px-2 rounded-full bg-accent/20 text-accent font-mono text-xs font-bold">
                    Step 1
                  </span>
                  <h3 className="text-sm font-bold text-text-page">Install Miro Plugin</h3>
                </div>
                <p className="text-xs text-text-muted leading-relaxed mb-4">
                  Add SyncBoard to your Miro team workspace with zero server setup or infrastructure required.
                </p>
              </div>
              <a
                href="https://miro.com/app-install/?response_type=code&client_id=3458764677695474299&redirect_uri=https%3A%2F%2Fsyncboard.luiskobayashi.com%2Fapi%2Foauth%2Fmiro%2Fcallback"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-bg-page font-mono text-xs font-bold hover:opacity-90 transition"
              >
                Install to Miro Team ↗
              </a>
            </div>

            {/* Step 2A */}
            <div className="p-4 rounded-xl bg-bg-page/50 border border-border-card/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center justify-center h-6 px-2 rounded-full bg-accent/20 text-accent font-mono text-xs font-bold">
                    Step 2A
                  </span>
                  <h3 className="text-sm font-bold text-text-page">Connect Figma</h3>
                </div>
                <p className="text-xs text-text-muted leading-relaxed mb-4">
                  Authorize 1-click read-only Figma access in Miro SyncBoard App settings. <span className="text-text-page font-medium">Optional:</span> install Figma Desktop plugin for live frame selection.
                </p>
              </div>
              <Link
                href="/docs/setup#for-community-version"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border-card text-text-page font-mono text-xs font-semibold hover:bg-bg-card transition"
              >
                Optional: Figma Companion →
              </Link>
            </div>

            {/* Step 2B */}
            <div className="p-4 rounded-xl bg-bg-page/50 border border-border-card/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center justify-center h-6 px-2 rounded-full bg-accent/20 text-accent font-mono text-xs font-bold">
                    Step 2B
                  </span>
                  <h3 className="text-sm font-bold text-text-page">Connect Penpot</h3>
                </div>
                <p className="text-xs text-text-muted leading-relaxed mb-4">
                  Install the Penpot Companion Plugin inside Penpot to link your design canvas directly to Miro using a secure <span className="text-text-page font-medium">Pairing Key</span>.
                </p>
              </div>
              <Link
                href="/docs/setup#for-community-version-1"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border-card text-text-page font-mono text-xs font-semibold hover:bg-bg-card transition"
              >
                Install Penpot Companion →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Self-Hosted (Vercel) */}
      {activeTab === 'selfhosted' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-5 rounded-xl bg-bg-page/60 border border-accent/20">
            <div className="space-y-1 max-w-xl">
              <span className="inline-block font-mono text-[10px] font-bold text-accent uppercase tracking-wider">
                1-Click Personal Serverless Deployment
              </span>
              <h3 className="text-base font-bold text-text-page">Deploy SyncBoard on Vercel</h3>
              <p className="text-xs text-text-muted leading-relaxed">
                Deploy your own isolated, zero-trust SyncBoard proxy engine. Automatically clones the repository to your GitHub account and prompts for environment credentials.
              </p>
            </div>

            {/* Vercel Deploy Button */}
            <div className="shrink-0">
              <a
                href={vercelDeployUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#000000] dark:bg-[#FFFFFF] text-[#FFFFFF] dark:text-[#000000] font-mono font-bold text-xs hover:opacity-90 transition shadow-md border border-border-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 76 65" xmlns="http://www.w3.org/2000/svg">
                  <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                </svg>
                Deploy with Vercel
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-bg-page/50 border border-border-card/60">
              <span className="font-mono text-xs font-bold text-accent">Step 1</span>
              <h4 className="text-xs font-bold text-text-page mt-1 mb-1">Click Deploy Button</h4>
              <p className="text-[11px] text-text-muted leading-normal">
                Clones `syncboard` to your GitHub account and provisions Next.js App Router serverless endpoints on Vercel.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-bg-page/50 border border-border-card/60">
              <span className="font-mono text-xs font-bold text-accent">Step 2</span>
              <h4 className="text-xs font-bold text-text-page mt-1 mb-1">Set Credentials</h4>
              <p className="text-[11px] text-text-muted leading-normal">
                Enter your `FIGMA_CLIENT_SECRET`, `MIRO_CLIENT_SECRET`, `ABLY_API_KEY`, and `UPSTASH_REDIS_REST_TOKEN`.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-bg-page/50 border border-border-card/60">
              <span className="font-mono text-xs font-bold text-accent">Step 3</span>
              <h4 className="text-xs font-bold text-text-page mt-1 mb-1">Update Miro App URL</h4>
              <p className="text-[11px] text-text-muted leading-normal">
                Point your Miro Developer App redirect URI to `https://your-app.vercel.app/api/oauth/miro/callback`.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs font-mono border-t border-border-card/60">
            <span className="text-text-muted">Need step-by-step developer setup or Docker instructions?</span>
            <div className="flex items-center gap-3">
              <Link
                href="/docs/setup#for-self-hosters-1-click-vercel-deploy-or-custom-registration"
                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-bg-page font-bold text-xs hover:opacity-90 transition"
              >
                Self-Hosted Setup Guide →
              </Link>
              <Link
                href="/docs/architecture-security-and-limits"
                className="text-text-muted hover:text-text-page transition font-semibold hidden md:inline-block"
              >
                Security & Limits →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuickStartSection;
