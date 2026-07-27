import type { ReactNode } from 'react';

export interface DocSectionHeaderProps {
  icon?: ReactNode;
  category: string;
  title: string;
  description?: string;
  count?: number;
}

export function DocSectionHeader({
  icon,
  category,
  title,
  description,
  count,
}: DocSectionHeaderProps) {
  return (
    <div className="space-y-2 pb-3 border-b border-border-card/60">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {icon && (
            <span className="text-accent flex items-center shrink-0" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="text-sm font-mono font-bold uppercase tracking-wider text-accent">
            {category}
          </span>
          {typeof count === 'number' && (
            <span className="text-xs font-mono px-2.5 py-0.5 rounded border border-border-card/80 text-text-muted">
              {count} {count === 1 ? 'doc' : 'docs'}
            </span>
          )}
        </div>
      </div>
      <h2 className="text-xl md:text-2xl font-black tracking-tight text-text-page">{title}</h2>
      {description && (
        <p className="text-sm text-text-muted leading-relaxed">{description}</p>
      )}
    </div>
  );
}
