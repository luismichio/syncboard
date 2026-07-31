import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities';
import { GroupedSyncedImage } from '../types';

interface SyncTabProps {
  selectedItemsCount: number;
  groupedItems: GroupedSyncedImage[];
  syncAllCopies: boolean;
  setSyncAllCopies: (value: boolean) => void;
  preserveSize: boolean;
  setPreserveSize: (value: boolean) => void;
  propagate: boolean;
  setPropagate: (value: boolean) => void;
  isSyncing: boolean;
  hasMiroToken: boolean;
  onSync: () => void;
  onGroupSettingChange: (itemIds: string[], key: 'format' | 'scale', value: unknown) => void;
  availableScales: number[];
}

export function SyncTab({
  selectedItemsCount,
  groupedItems,
  syncAllCopies,
  setSyncAllCopies,
  preserveSize,
  setPreserveSize,
  propagate,
  setPropagate,
  isSyncing,
  hasMiroToken,
  onSync,
  onGroupSettingChange,
  availableScales,
}: SyncTabProps) {
  return (
    <div className="flex-grow flex flex-col justify-between">
      <div className="space-y-3">
        <h4 className="text-[10px] uppercase font-mono tracking-widest text-text-muted">
          Selected Canvas Screens
        </h4>

        {selectedItemsCount > 0 ? (
          <div className="space-y-3">
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {groupedItems.map((group) => (
                <div
                  key={group.key}
                  className="p-3 rounded-md bg-bg-card border border-border-card flex flex-col gap-2 relative animate-fade-in"
                >
                  <div className="absolute top-2 right-2 flex items-center gap-1.5">
                    <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-accent border border-accent/40 bg-transparent px-1.5 py-0.5 rounded">
                      {group.platform === 'penpot' ? 'Penpot' : 'Figma'}
                    </span>

                    {group.widgets.length > 1 && (
                      <span className="px-1.5 py-0.5 text-[8px] font-bold font-mono bg-accent/20 border border-accent/40 text-accent rounded-full">
                        x{group.widgets.length}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col pr-16">
                    <span className="text-xs font-semibold text-text-page truncate">
                      {decodeHtmlEntities(group.nodeName)}
                    </span>
                    <span className="text-[9px] font-mono text-text-muted truncate">
                      ID: {group.nodeId}
                    </span>
                  </div>

                  <div className="flex gap-2 mt-1 pt-2 border-t border-border-card/30">
                    <div className="flex-1 flex flex-col gap-0.5">
                      <span className="text-[8px] font-mono text-text-muted uppercase tracking-wider">Format</span>
                      <select
                        value={group.format}
                        onChange={(e) => onGroupSettingChange(group.widgets.map((w) => w.id), 'format', e.target.value as 'png' | 'svg')}
                        className="bg-bg-page border border-border-card text-[10px] rounded px-1.5 py-0.5 focus:outline-none focus:border-accent text-text-page w-full cursor-pointer"
                      >
                        <option value="png">PNG</option>
                        <option value="svg">SVG</option>
                      </select>
                    </div>

                    {group.format === 'png' && (
                      <div className="flex-1 flex flex-col gap-0.5">
                        <span className="text-[8px] font-mono text-text-muted uppercase tracking-wider">Scale</span>
                        <select
                          value={group.scale}
                          onChange={(e) => onGroupSettingChange(group.widgets.map((w) => w.id), 'scale', Number(e.target.value))}
                          className="bg-bg-page border border-border-card text-[10px] rounded px-1.5 py-0.5 focus:outline-none focus:border-accent text-text-page w-full cursor-pointer"
                        >
                          {availableScales.map((s) => (
                            <option key={s} value={s}>{s}x</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={syncAllCopies}
                onChange={(e) => setSyncAllCopies(e.target.checked)}
                className="accent-accent w-3 h-3"
              />
              <span className="text-[10px] text-text-muted font-mono">
                Also update all board copies
              </span>
            </label>

            <label className="flex flex-col gap-0.5 mt-1.5 cursor-pointer select-none">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={preserveSize}
                  onChange={(e) => setPreserveSize(e.target.checked)}
                  className="accent-accent w-3 h-3"
                />
                <span className="text-[10px] text-text-muted font-mono">
                  Keep canvas size
                </span>
              </div>
              <p className="ml-5 text-[8px] font-mono text-text-muted/50 leading-tight">
                Size locked. Crop resets — Miro API limitation.
              </p>
            </label>

            {syncAllCopies && (
              <label className="flex items-center gap-2 mt-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={propagate}
                  onChange={(e) => {
                    setPropagate(e.target.checked);
                    if (e.target.checked) setPreserveSize(false);
                  }}
                  className="accent-accent w-3 h-3"
                />
                <span className="text-[10px] text-text-muted font-mono">
                  Propagate format &amp; scale to all copies
                </span>
              </label>
            )}

            {groupedItems.length > 3 && (
              <div className="flex items-start gap-2 p-2.5 mt-2 rounded-md bg-bg-card border border-amber-500/60">
                <svg className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <span className="text-xs font-mono leading-snug text-text-page">
                  Only 3 items can be synced at once. Deselect some to continue.
                </span>
              </div>
            )}

            <button
              onClick={onSync}
              disabled={isSyncing || !hasMiroToken || groupedItems.length > 3}
              className="w-full mt-2 font-mono font-bold text-xs py-2.5 rounded bg-accent text-bg-page hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {syncAllCopies ? 'SYNC + UPDATE ALL COPIES' : 'SYNC SELECTED'}
            </button>
          </div>
        ) : (
          <div className="p-8 rounded-md border border-dashed border-border-card text-center text-xs text-text-muted py-12">
            Select one or more Figma or Penpot screenshots on the board canvas to update them in-place.
          </div>
        )}
      </div>
    </div>
  );
}
