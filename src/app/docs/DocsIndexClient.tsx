'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { DocCard } from '@/components/docs/DocCard';
import { DocSectionHeader } from '@/components/docs/DocSectionHeader';
import { DocSearchInput } from '@/components/docs/DocSearchInput';
import CookieSettingsButton from '@/components/CookieSettingsButton';
import ThemeToggle from '@/components/ThemeToggle';
import { VersionStamp } from '@/components/VersionStamp';

import QuickStartSection from '@/components/docs/QuickStartSection';

export interface DocItemMeta {
  slug: string;
  title: string;
  description: string;
  filename: string;
  size: number;
}

export interface DocsIndexClientProps {
  docs: DocItemMeta[];
}

// ── Lucide Vector Icons (strokeWidth="1.5") ──

const RocketIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.71 1.1-1.38 1.1-1.38" />
    <path d="M12 15l-3-3" />
    <path d="M14.5 9a3.5 3.5 0 1 1-5 0" />
    <path d="M12 15s5-1 7.5-6.5C21 6.5 20.5 3 20.5 3s-3.5-.5-5.5 1C9.5 6.5 8.5 11.5 8.5 11.5" />
  </svg>
);

const LayersIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const BookOpenIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a1 1 0 0 0 1 1h4" />
    <path d="M10 9H8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </svg>
);

const ArchiveIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="5" x="2" y="3" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </svg>
);

// Sub-module Lucide Icons
const PlugIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
  </svg>
);

const TargetIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
  </svg>
);

const ZapIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const ShieldIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.8 17 5 19 5a1 1 0 0 1 1 1z" />
  </svg>
);

const ServerIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="8" x="2" y="2" rx="2" /><rect width="20" height="8" x="2" y="14" rx="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" />
  </svg>
);

const KeyIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21 2-2 2m-1.5 1.5L16 7v2h-2v2h-2l-1 1" /><circle cx="7.5" cy="16.5" r="4.5" />
  </svg>
);

const BotIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
  </svg>
);

export function DocsIndexClient({ docs }: DocsIndexClientProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const docMap = new Map(docs.map((d) => [d.slug, d]));
  const getMeta = (slug: string) => docMap.get(slug);

  const readmeSlug = 'readme';
  const gettingStartedSlugs = ['setup', 'roadmap', 'features'];
  const mainArchSlug = 'architecture';
  const archSubmoduleSlugs = [
    'architecture-sources',
    'architecture-targets',
    'architecture-selection-and-relay',
    'architecture-security-and-limits',
    'architecture-testing',
    'environment-variables',
    'architecture-infrastructure-and-costs',
    'architecture-mcp-roadmap',
  ];

  const referenceSlugs = ['changelog', 'privacy', 'license', 'faq', 'contributing', 'security'];
  const archiveSlugs = [
    'architecture-archive-chromium-loopback',
    'architecture-archive-architecture-evolution',
  ];

  return (
    <main className="min-h-screen bg-bg-page text-text-page font-sans selection:bg-accent selection:text-bg-page relative overflow-x-clip">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M0 40h40V0H0v40zM39 39H1V1h38v38z' fill='%23FAF9F5'/%3E%3C/svg%3E")`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-bg-page/80 backdrop-blur-md border-b border-border-card transition-all">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:opacity-80 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg">
              <span className="text-lg font-bold tracking-tight">SyncingBoard</span>
            </Link>
            <span className="text-text-muted font-mono text-xs" aria-hidden="true">/</span>
            <span className="text-xs font-mono text-accent font-semibold">docs</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/luismichio/syncingboard"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex px-4 py-2 rounded-lg font-mono font-bold text-xs border border-border-card text-text-page hover:bg-bg-card transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              VIEW ON GITHUB
            </a>
            <VersionStamp
              as="span"
              className="hidden md:inline-flex text-xs font-mono text-text-muted px-3 py-2 rounded-lg border border-border-card"
            />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-12 space-y-12">
        {/* Title & Search Bar */}
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="inline-block px-2.5 py-0.5 text-xs font-mono font-medium border border-accent/25 text-accent rounded bg-accent/5">
              DOCUMENTATION HUB
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-text-page">
              SyncingBoard Documentation
            </h1>
            <p className="text-sm text-text-muted max-w-2xl leading-relaxed">
              Explore quickstart setup guides, system architecture specifications, API rate limits, self-hosting cost breakdowns, and security standards.
            </p>
          </div>

          <DocSearchInput value={searchQuery} onChange={setSearchQuery} />
        </div>

        {/* Interactive Quick Start Guide (Community vs Self-Hosted Vercel Deploy) */}
        {!searchQuery && <QuickStartSection />}

        {/* Tier 1: GETTING STARTED & OVERVIEW */}
        {(readmeSlug || gettingStartedSlugs.length > 0) && (
          <section className="space-y-4">
            <DocSectionHeader
              icon={RocketIcon}
              category="Getting Started"
              title="Overview, Setup & Video Demos"
              description="Everything you need to set up SyncingBoard and see core features in action."
              count={(readmeSlug ? 1 : 0) + gettingStartedSlugs.length}
            />

            {/* Main Project Overview Full-Width Card (Identical to Architecture Card) */}
            {readmeSlug && getMeta('readme') && (
              <DocCard
                slug="readme"
                title={getMeta('readme')!.title}
                description={getMeta('readme')!.description}
                badge="OVERVIEW"
                variant="featured"
                sizeBytes={getMeta('readme')!.size}
              />
            )}

            {/* Quickstart & Features Grid */}
            {gettingStartedSlugs.length > 0 && (
              <div className="grid md:grid-cols-2 gap-4 pt-2">
                {gettingStartedSlugs.map((slug) => {
                  const item = getMeta(slug);
                  if (!item) return null;
                  const isFeatures = slug === 'features';
                  return (
                    <DocCard
                      key={slug}
                      slug={slug}
                      title={item.title}
                      description={item.description}
                      badge={slug === 'features' ? 'VIDEOS' : slug === 'roadmap' ? 'MILESTONES' : 'QUICKSTART'}
                      variant="featured"
                      sizeBytes={item.size}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Tier 2: ARCHITECTURE & SYSTEM DESIGN */}
        {(mainArchSlug || archSubmoduleSlugs.length > 0) && (
          <section className="space-y-4">
            <DocSectionHeader
              icon={LayersIcon}
              category="Architecture & Specifications"
              title="System Design & Adapter Modules"
              description="Technical specifications detailing source adapters, target whiteboards, Ably relay transport, and security controls."
              count={(mainArchSlug ? 1 : 0) + archSubmoduleSlugs.length}
            />

            {/* Main Master Architecture Hub Card */}
            {mainArchSlug && getMeta('architecture') && (
              <DocCard
                slug="architecture"
                title={getMeta('architecture')!.title}
                description={getMeta('architecture')!.description}
                badge="CORE SPEC"
                variant="featured"
                sizeBytes={getMeta('architecture')!.size}
              />
            )}

            {/* Modular Deep Dives Grid */}
            {archSubmoduleSlugs.length > 0 && (
              <div className="grid md:grid-cols-2 gap-3 pt-2">
                {archSubmoduleSlugs.map((slug) => {
                  const item = getMeta(slug);
                  if (!item) return null;

                  let iconNode: ReactNode = PlugIcon;
                  let status: 'stable' | 'design' = 'stable';
                  if (slug.includes('targets')) iconNode = TargetIcon;
                  else if (slug.includes('selection')) iconNode = ZapIcon;
                  else if (slug.includes('security')) iconNode = ShieldIcon;
                  else if (slug.includes('environment-variables')) iconNode = KeyIcon;
                  else if (slug.includes('infrastructure')) iconNode = ServerIcon;
                  else if (slug.includes('mcp')) {
                    iconNode = BotIcon;
                    status = 'design';
                  }

                  return (
                    <DocCard
                      key={slug}
                      slug={slug}
                      title={item.title}
                      description={item.description}
                      status={status}
                      icon={iconNode}
                      variant="submodule"
                      sizeBytes={item.size}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Tier 3: REFERENCE & POLICIES */}
        {referenceSlugs.length > 0 && (
          <section className="space-y-4">
            <DocSectionHeader
              icon={BookOpenIcon}
              category="Reference"
              title="Release Notes & Legal Terms"
              description="Version history, open-source license, privacy safeguards, and frequently asked questions."
              count={referenceSlugs.length}
            />
            <div className="grid md:grid-cols-2 gap-4">
              {referenceSlugs.map((slug) => {
                const item = getMeta(slug);
                if (!item) return null;
                return (
                  <DocCard
                    key={slug}
                    slug={slug}
                    title={item.title}
                    description={item.description}
                    variant="standard"
                    sizeBytes={item.size}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Tier 4: ARCHIVED RESEARCH LOGS */}
        {archiveSlugs.length > 0 && (
          <section className="space-y-4 pt-4 border-t border-border-card">
            <DocSectionHeader
              icon={ArchiveIcon}
              category="Archives"
              title="Historical Research Logs"
              description="Preserved engineering research on Chromium Private Network Access (PNA) and architecture evolution."
              count={archiveSlugs.length}
            />
            <div className="grid md:grid-cols-2 gap-3">
              {archiveSlugs.map((slug) => {
                const item = getMeta(slug);
                if (!item) return null;
                return (
                  <DocCard
                    key={slug}
                    slug={slug}
                    title={item.title}
                    description={item.description}
                    status="historical"
                    variant="archived"
                    sizeBytes={item.size}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* AI Agent Note Footer */}
        <div className="p-5 rounded-xl border border-border-card bg-bg-card space-y-2">
          <p className="text-xs font-mono text-text-muted flex items-center gap-1.5">
            <span className="text-accent flex items-center shrink-0" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </span>
            <span className="text-accent font-semibold">For AI agents:</span> All documentation content is accessible via raw markdown endpoints:
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-text-muted">
            <code className="text-accent font-semibold">GET /api/docs/list</code>
            <code className="text-accent font-semibold">GET /api/docs/raw?slug=&lt;slug&gt;</code>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border-card">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between text-xs font-mono text-text-muted">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/docs/license"
              className="px-2.5 py-1 rounded-lg bg-bg-card border border-border-card text-text-muted hover:text-text-page hover:border-text-muted/40 transition duration-200 inline-flex items-center gap-1.5 text-xs font-mono select-none"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                <path d="M7 21h10" />
                <path d="M12 3v18" />
                <path d="M3 7h18" />
              </svg>
              <span>AGPLv3 License</span>
            </Link>
            <CookieSettingsButton />
            <ThemeToggle />
          </div>
          <a
            href="https://github.com/luismichio/syncingboard"
            target="_blank"
            rel="noreferrer"
            className="hover:text-text-page transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
          >
            github.com/luismichio/syncingboard
          </a>
        </div>
      </footer>
    </main>
  );
}
