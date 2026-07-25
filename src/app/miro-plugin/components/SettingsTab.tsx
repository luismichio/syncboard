import ThemeToggle from '@/components/ThemeToggle';

interface SettingsTabProps {
  tokensLoading: boolean;
  figmaToken: string | null;
  miroToken: string | null;
  connectFigma: () => void;
  connectMiro: () => void;
  disconnectFigma: () => Promise<void>;
  disconnectMiro: () => Promise<void>;
  copiedPairing: boolean;
  pairingId: string;
  copyPairingId: () => void;
  useTauri: boolean;
  defaultPngScale: number;
  onDefaultPngScaleChange: (value: number) => void;
  availableScales: number[];
}

export function SettingsTab({
  tokensLoading,
  figmaToken,
  miroToken,
  connectFigma,
  connectMiro,
  disconnectFigma,
  disconnectMiro,
  copiedPairing,
  pairingId,
  copyPairingId,
  useTauri,
  defaultPngScale,
  onDefaultPngScaleChange,
  availableScales,
}: SettingsTabProps) {
  return (
    <div className="flex-grow flex flex-col gap-6">
      <div>
        <h4 className="text-[10px] uppercase font-mono tracking-widest text-text-muted mb-2">
          Integrations
        </h4>
        <div className="space-y-2">
          <div className="p-3 rounded-lg bg-bg-card border border-border-card flex justify-between items-center">
            <div>
              <div className="text-xs font-semibold text-text-page">Figma Status</div>
              <div className="text-[10px] text-text-muted">OAuth connection for frame rendering</div>
            </div>
            {tokensLoading ? (
              <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse"></span>
            ) : figmaToken ? (
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
                <button
                  onClick={disconnectFigma}
                  className="text-[9px] font-mono font-bold tracking-wider text-text-muted hover:text-accent uppercase underline bg-transparent cursor-pointer"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={connectFigma}
                className="text-[10px] font-mono tracking-wider font-semibold border border-accent text-accent rounded px-2.5 py-1 bg-transparent hover:bg-accent hover:text-bg-page transition cursor-pointer"
              >
                CONNECT
              </button>
            )}
          </div>

          <div className="p-3 rounded-lg bg-bg-card border border-border-card flex justify-between items-center">
            <div>
              <div className="text-xs font-semibold text-text-page">Miro REST Status</div>
              <div className="text-[10px] text-text-muted">OAuth connection for board image updates</div>
            </div>
            {tokensLoading ? (
              <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse"></span>
            ) : miroToken ? (
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
                <button
                  onClick={disconnectMiro}
                  className="text-[9px] font-mono font-bold tracking-wider text-text-muted hover:text-accent uppercase underline bg-transparent cursor-pointer"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={connectMiro}
                className="text-[10px] font-mono tracking-wider font-semibold border border-accent text-accent rounded px-2.5 py-1 bg-transparent hover:bg-accent hover:text-bg-page transition cursor-pointer"
              >
                CONNECT
              </button>
            )}
          </div>

          <div className="p-3 rounded-lg bg-bg-card/50 border border-border-card/50 flex justify-between items-center opacity-50 select-none">
            <div>
              <div className="text-xs font-semibold text-text-page">SyncBridge</div>
              <div className="text-[10px] text-text-muted">
                Local desktop bridge — coming soon
              </div>
            </div>
            <span className="text-[8px] font-mono uppercase tracking-wider text-text-muted/50">
              Future
            </span>
          </div>

          <div className="p-3 rounded-lg bg-bg-card border border-border-card flex flex-col gap-2 animate-fade-in">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-text-page">Miro Pairing ID</span>
              <button
                onClick={copyPairingId}
                className="text-[9px] font-mono font-bold tracking-wider text-accent border border-accent/40 rounded px-1.5 py-0.5 bg-transparent hover:bg-accent hover:text-bg-page transition cursor-pointer"
              >
                {copiedPairing ? 'COPIED!' : 'COPY ID'}
              </button>
            </div>
            <input
              type="text"
              value={pairingId}
              readOnly={true}
              placeholder="sb_xxxxx"
              className="w-full text-[10px] font-mono bg-bg-page border border-border-card rounded p-1.5 text-text-page select-all focus:outline-none focus:border-accent"
            />
            <p className="text-[9px] text-text-muted leading-tight mt-0.5">
              Paste this pairing ID inside the Penpot Companion Plugin to link Miro and Penpot.
            </p>
            <p className="text-[9px] text-text-muted leading-tight mt-0.5">
              {useTauri
                ? 'Transport mode: Local SyncBridge (Tauri).'
                : 'Transport mode: Cloud relay (recommended for Penpot web sandbox).'}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-[10px] uppercase font-mono tracking-widest text-text-muted mb-2">
          Preferences
        </h4>
        <div className="space-y-2">
          <div className="p-3 rounded-lg bg-bg-card border border-border-card flex justify-between items-center">
            <span className="text-xs font-semibold text-text-page">Default PNG Scale</span>
            <select
              value={defaultPngScale}
              onChange={(e) => onDefaultPngScaleChange(Number(e.target.value))}
              className="bg-bg-page border border-border-card text-xs rounded px-2 py-1 focus:outline-none focus:border-accent text-text-page cursor-pointer"
            >
              {availableScales.map((s) => (
                <option key={s} value={s}>{s}x</option>
              ))}
            </select>
          </div>

          <div className="p-3 rounded-lg bg-bg-card border border-border-card flex justify-between items-center">
            <span className="text-xs font-semibold text-text-page">Theme Select</span>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-border-card">
        <a
          href="https://syncboard.luiskobayashi.com/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-[10px] font-mono text-text-muted hover:text-accent transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          Documentation
        </a>
      </div>
    </div>
  );
}
