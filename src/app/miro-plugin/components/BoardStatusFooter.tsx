import { SyncStatus } from '../useMiroPlugin';

interface BoardStatusFooterProps {
  status: SyncStatus | null;
}

/**
 * Color-coded status bar — green for success, red for errors, amber with
 * pulse animation during active operations, neutral gray for info.
 */
export function BoardStatusFooter({ status }: BoardStatusFooterProps) {
  if (!status) return null;

  const typeStyles: Record<string, string> = {
    success: 'text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/5',
    error: 'text-red-600 dark:text-red-400 border-red-500/30 bg-red-500/5',
    progress: 'text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/5',
    info: 'text-text-muted border-border-card bg-bg-card',
  };

  const animClass = status.type === 'progress' ? 'animate-pulse' : '';

  return (
    <footer className="mt-4 border-t border-border-card pt-4">
      <div className={`p-2.5 rounded font-mono text-[10px] border ${typeStyles[status.type] || typeStyles.info} ${animClass} transition-colors duration-300`}>
        {status.type === 'progress' && (
          <span className="inline-block w-2 h-2 rounded-full bg-current mr-1.5 animate-pulse" />
        )}
        {status.message}
      </div>
    </footer>
  );
}
