'use client';

import { useMiroPlugin } from './useMiroPlugin';
import ThemeToggle from '@/components/ThemeToggle';

export default function MiroPluginPage() {
  const {
    isInitMode,
    figmaToken,
    miroToken,
    selectedItems,
    isSyncing,
    syncStatus,
    figmaInput,
    figmaNodeInfo,
    isDetectingLocal,
    connectFigma,
    connectMiro,
    parseFigmaLink,
    detectLocalFigmaSelection,
    importFigmaScreen,
    syncSelectedScreens,
  } = useMiroPlugin();

  if (isInitMode === null) {
    return null; // Server hydration fallback
  }

  // Headless mode returns empty loader page
  if (isInitMode === true) {
    return <div className="bg-bg-page h-screen"></div>;
  }

  // Headless mode is false: render Sidebar Panel
  return (
    <div className="flex flex-col min-h-screen p-5 bg-bg-page text-text-page font-sans selection:bg-accent selection:text-bg-page transition-colors duration-200">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-accent">SyncBoard</h2>
          <p className="text-xs text-text-muted">Stateless Figma-Miro Pipeline</p>
        </div>
        <ThemeToggle />
      </header>

      {/* 1. Connection Status Panels */}
      <section className="mb-6 space-y-3">
        <div className="p-3 rounded-lg bg-bg-card border border-border-card flex justify-between items-center">
          <div>
            <div className="text-xs font-semibold text-text-page">Figma Status</div>
            <div className="text-[10px] text-text-muted">
              {figmaToken ? 'Connected securely' : 'Token expired or disconnected'}
            </div>
          </div>
          {figmaToken ? (
            <span className="h-2 w-2 rounded-full bg-green-500"></span>
          ) : (
            <button
              onClick={connectFigma}
              className="text-[11px] font-mono tracking-wider font-semibold border border-accent text-accent rounded px-2.5 py-1 bg-transparent hover:bg-accent hover:text-bg-page transition"
            >
              CONNECT
            </button>
          )}
        </div>

        <div className="p-3 rounded-lg bg-bg-card border border-border-card flex justify-between items-center">
          <div>
            <div className="text-xs font-semibold text-text-page">Miro REST Status</div>
            <div className="text-[10px] text-text-muted">
              {miroToken ? 'Connected securely' : 'Token expired or disconnected'}
            </div>
          </div>
          {miroToken ? (
            <span className="h-2 w-2 rounded-full bg-green-500"></span>
          ) : (
            <button
              onClick={connectMiro}
              className="text-[11px] font-mono tracking-wider font-semibold border border-accent text-accent rounded px-2.5 py-1 bg-transparent hover:bg-accent hover:text-bg-page transition"
            >
              CONNECT
            </button>
          )}
        </div>
      </section>

      {/* 2. Selection Tracker & Bulk Sync */}
      <section className="flex-grow">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-xs uppercase font-mono tracking-widest text-text-muted">
              Canvas Selection
            </h4>
            <span className="text-[10px] font-mono bg-bg-card text-text-muted px-2 py-0.5 rounded border border-border-card">
              {selectedItems.length} Matched
            </span>
          </div>

          {selectedItems.length > 0 ? (
            <div className="space-y-2 mb-4">
              {selectedItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-md bg-bg-card border border-border-card flex flex-col gap-1"
                >
                  <span className="text-xs font-semibold text-text-page">
                    {item.nodeName}
                  </span>
                  <span className="text-[9px] font-mono text-text-muted">
                    Node: {item.nodeId}
                  </span>
                </div>
              ))}
              <button
                onClick={syncSelectedScreens}
                disabled={isSyncing || !figmaToken || !miroToken}
                className="w-full mt-2 font-mono font-bold text-xs py-2.5 rounded bg-accent text-bg-page hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                SYNC SELECTED SCREENS
              </button>
            </div>
          ) : (
            <div className="p-5 rounded-md border border-dashed border-border-card text-center text-xs text-text-muted">
              Select one or more synced images on the canvas to update them in-place.
            </div>
          )}
        </div>

        {/* 3. Screen Importer */}
        {figmaToken && (
          <div className="border-t border-border-card pt-5">
            <h4 className="text-xs uppercase font-mono tracking-widest text-text-muted mb-3">
              Import Figma Screen
            </h4>

            {/* A. Local Figma selection hook */}
            <button
              onClick={detectLocalFigmaSelection}
              disabled={isDetectingLocal}
              className="w-full mb-3 flex items-center justify-center gap-2 border border-border-card text-xs font-semibold rounded py-2 hover:bg-bg-card transition text-text-page"
            >
              {isDetectingLocal ? 'Detecting...' : 'Detect Selection in Figma App'}
            </button>

            <div className="text-[10px] text-center text-text-muted mb-3">or</div>

            {/* B. Manual link input */}
            <input
              type="text"
              placeholder="Paste Figma frame link..."
              value={figmaInput}
              onChange={(e) => {
                // Call async parseFigmaLink safely
                parseFigmaLink(e.target.value).catch((err) => {
                  console.error('Link parsing error:', err);
                });
              }}
              className="w-full text-xs p-2.5 bg-bg-card border border-border-card rounded text-text-page focus:outline-none focus:border-accent mb-3"
            />

            {figmaNodeInfo && (
              <div className="p-3 bg-bg-card rounded border border-border-card mb-3">
                <div className="text-xs font-bold text-text-page truncate">
                  {figmaNodeInfo.name}
                </div>
                <div className="text-[9px] font-mono text-text-muted truncate">
                  File: {figmaNodeInfo.fileKey}
                </div>
                <button
                  onClick={importFigmaScreen}
                  disabled={isSyncing}
                  className="w-full mt-3 font-mono font-bold text-xs py-2 rounded bg-accent text-bg-page hover:opacity-90 transition"
                >
                  PLACE ON CANVAS
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 4. Logging & Status Board */}
      {syncStatus && (
        <footer className="mt-auto border-t border-border-card pt-4">
          <div className="p-2.5 rounded font-mono text-[10px] bg-bg-card border border-border-card text-amber-800 dark:text-yellow-400">
            {syncStatus}
          </div>
        </footer>
      )}
    </div>
  );
}
