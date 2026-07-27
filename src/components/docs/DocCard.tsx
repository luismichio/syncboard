import type { ReactNode } from 'react';
import Link from 'next/link';

export type DocCardVariant = 'featured' | 'standard' | 'submodule' | 'archived';

export interface DocCardProps {
  slug: string;
  title: string;
  description?: string;
  badge?: string;
  status?: 'stable' | 'draft' | 'design' | 'historical' | 'live' | 'planned';
  sizeBytes?: number;
  wordCount?: number;
  variant?: DocCardVariant;
  icon?: ReactNode;
}

export function DocCard({
  slug,
  title,
  description,
  badge,
  status,
  sizeBytes,
  variant = 'standard',
  icon,
}: DocCardProps) {
  const isFeatured = variant === 'featured';
  const isArchived = variant === 'archived';
  const isSubmodule = variant === 'submodule';

  const sizeKb = sizeBytes ? (sizeBytes / 1024).toFixed(1) : null;

  return (
    <Link
      href={`/docs/${slug}`}
      className={`group relative block rounded-xl border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page ${
        isFeatured
          ? 'p-6 md:p-8 bg-bg-card border-accent/40 hover:border-accent'
          : isArchived
          ? 'p-4 bg-bg-card/40 border-border-card/50 hover:border-border-card opacity-80 hover:opacity-100'
          : isSubmodule
          ? 'p-5 bg-bg-card/80 border-border-card hover:border-accent/60'
          : 'p-6 bg-bg-card border-border-card hover:border-accent/60'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2.5 min-w-0 flex-1">
          {/* Header Badges */}
          <div className="flex flex-wrap items-center gap-2">
            {icon && (
              <span className="text-accent flex items-center shrink-0" aria-hidden="true">
                {icon}
              </span>
            )}
            {badge && (
              <span className="inline-block px-2 py-0.5 text-[11px] font-mono font-medium text-accent border border-accent/30 rounded bg-accent/5">
                {badge}
              </span>
            )}
            {status && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono text-text-muted border border-border-card rounded bg-bg-card/40">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    status === 'stable' || status === 'live'
                      ? 'bg-emerald-400'
                      : status === 'draft' || status === 'planned' || status === 'design'
                      ? 'bg-amber-400'
                      : 'bg-text-muted/60'
                  }`}
                  aria-hidden="true"
                />
                <span className="capitalize">{status}</span>
              </span>
            )}
          </div>

          {/* Title */}
          <div className="flex items-center gap-2">
            <h3
              className={`font-bold tracking-tight text-text-page group-hover:text-accent transition-colors ${
                isFeatured
                  ? 'text-xl md:text-2xl font-extrabold'
                  : isSubmodule
                  ? 'text-sm font-bold'
                  : 'text-base font-bold'
              }`}
            >
              {title}
            </h3>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="text-text-muted opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all shrink-0"
            >
              <path d="M7 7h10v10" />
              <path d="M7 17 17 7" />
            </svg>
          </div>

          {/* Description */}
          {description && (
            <p
              className={`text-text-muted leading-relaxed line-clamp-2 ${
                isFeatured ? 'text-sm' : 'text-xs'
              }`}
            >
              {description}
            </p>
          )}
        </div>

        {/* File Size Metadata */}
        {sizeKb && (
          <span className="text-xs font-mono text-text-muted/80 shrink-0 mt-0.5">
            {sizeKb} KB
          </span>
        )}
      </div>
    </Link>
  );
}
