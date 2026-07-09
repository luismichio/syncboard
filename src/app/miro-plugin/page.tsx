'use client';

import { useState } from 'react';
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
    disconnectFigma,
    disconnectMiro,
    parseFigmaLink,
    detectLocalFigmaSelection,
    importFigmaScreen,
    syncSelectedScreens,
    syncAllCopies,
    setSyncAllCopies,
  } = useMiroPlugin();

  const [activeTab, setActiveTab] = useState<'sync' | 'import' | 'settings'>('sync');

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
      
      {/* App Header */}
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-accent">SyncBoard</h2>
          <p className="text-xs text-text-muted">Stateless Figma-Miro Pipeline</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Figma Status Indicator */}
          <span
            title={figmaToken ? "Figma Connected" : "Figma Disconnected"}
            className={`transition duration-200 ${figmaToken ? 'text-accent' : 'text-text-muted/20'}`}
          >
            <svg width="12" height="18" viewBox="0 0 38 57" fill="currentColor">
              <path d="M19 28.5c0-5.25-4.25-9.5-9.5-9.5S0 23.25 0 28.5 4.25 38 9.5 38H19v-9.5z"/>
              <path d="M19 9.5C19 4.25 14.75 0 9.5 0S0 4.25 0 9.5 4.25 19 9.5 19H19V9.5z"/>
              <path d="M38 9.5C38 4.25 33.75 0 28.5 0S19 4.25 19 9.5v9.5h9.5c5.25 0 9.5-4.25 9.5-9.5z"/>
              <path d="M38 28.5c0-5.25-4.25-9.5-9.5-9.5S19 23.25 19 28.5v9.5h9.5c5.25 0 9.5-4.25 9.5-9.5z"/>
              <path d="M19 47.5c0 5.25-4.25 9.5-9.5 9.5S0 52.75 0 47.5s4.25-9.5 9.5-9.5h9.5v9.5z"/>
            </svg>
          </span>
          {/* Miro Status Indicator */}
          <span
            title={miroToken ? "Miro Connected" : "Miro Disconnected"}
            className={`transition duration-200 ${miroToken ? 'text-accent' : 'text-text-muted/20'}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20V8l8 8 8-8v12" />
            </svg>
          </span>
        </div>
      </header>

      {/* Tabs Navigation Bar */}
      <div className="flex border-b border-border-card mb-5">
        <button
          onClick={() => setActiveTab('sync')}
          className={`flex-1 pb-2 text-xs font-mono tracking-wider font-semibold border-b-2 text-center transition ${
            activeTab === 'sync'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text-page'
          }`}
        >
          SYNC ({selectedItems.length})
        </button>
        <button
          onClick={() => setActiveTab('import')}
          className={`flex-1 pb-2 text-xs font-mono tracking-wider font-semibold border-b-2 text-center transition ${
            activeTab === 'import'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text-page'
          }`}
        >
          IMPORT
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 pb-2 text-xs font-mono tracking-wider font-semibold border-b-2 text-center transition ${
            activeTab === 'settings'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text-page'
          }`}
        >
          SETTINGS
        </button>
      </div>

      {/* Tab Panels */}
      <section className="flex-grow flex flex-col">
        
        {/* Tab 1: Sync Selection */}
        {activeTab === 'sync' && (
          <div className="flex-grow flex flex-col justify-between">
            <div className="space-y-3">
              <h4 className="text-[10px] uppercase font-mono tracking-widest text-text-muted">
                Selected Canvas Screens
              </h4>
              {selectedItems.length > 0 ? (
                <div className="space-y-2">
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
                  {/* Sync All Copies toggle */}
                  <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={syncAllCopies}
                      onChange={e => setSyncAllCopies(e.target.checked)}
                      className="accent-accent w-3 h-3"
                    />
                    <span className="text-[10px] text-text-muted font-mono">
                      Also update all board copies
                    </span>
                  </label>
                  <button
                    onClick={syncSelectedScreens}
                    disabled={isSyncing || !figmaToken || !miroToken}
                    className="w-full mt-3 font-mono font-bold text-xs py-2.5 rounded bg-accent text-bg-page hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {syncAllCopies ? 'SYNC + UPDATE ALL COPIES' : 'SYNC SELECTED'}
                  </button>
                </div>
              ) : (
                <div className="p-8 rounded-md border border-dashed border-border-card text-center text-xs text-text-muted py-12">
                  Select one or more Figma screenshots on the board canvas to update them in-place.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Figma Screen Importer */}
        {activeTab === 'import' && (
          <div className="flex-grow flex flex-col">
            {figmaToken ? (
              <div className="space-y-4">
                <div>
                  <h4 className="text-[10px] uppercase font-mono tracking-widest text-text-muted mb-2">
                    Query Active Selection
                  </h4>
                  <button
                    onClick={detectLocalFigmaSelection}
                    disabled={isDetectingLocal}
                    className="w-full flex items-center justify-center gap-2 border border-border-card text-xs font-semibold rounded py-2 hover:bg-bg-card transition text-text-page"
                  >
                    {isDetectingLocal ? 'Detecting Selection...' : 'Detect Selection in Figma App'}
                  </button>
                </div>

                <div className="text-[10px] text-center text-text-muted">— or paste link manually —</div>

                <div>
                  <h4 className="text-[10px] uppercase font-mono tracking-widest text-text-muted mb-2">
                    Paste Frame Link
                  </h4>
                  <input
                    type="text"
                    placeholder="https://figma.com/file/..."
                    value={figmaInput}
                    onChange={(e) => {
                      parseFigmaLink(e.target.value).catch((err) => {
                        console.error('Link parsing error:', err);
                      });
                    }}
                    className="w-full text-xs p-2.5 bg-bg-card border border-border-card rounded text-text-page focus:outline-none focus:border-accent"
                  />
                </div>

                {figmaNodeInfo && (
                  <div className="p-3 bg-bg-card rounded border border-border-card mt-3">
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
            ) : (
              <div className="p-8 rounded-md border border-dashed border-border-card text-center text-xs text-text-muted py-12 my-auto">
                Please connect your Figma account in the Settings tab to import new frames.
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Settings & Integrations */}
        {activeTab === 'settings' && (
          <div className="flex-grow flex flex-col gap-6">
            <div>
              <h4 className="text-[10px] uppercase font-mono tracking-widest text-text-muted mb-2">
                Integrations
              </h4>
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-bg-card border border-border-card flex justify-between items-center">
                  <div>
                    <div className="text-xs font-semibold text-text-page">Figma Status</div>
                    <div className="text-[10px] text-text-muted">
                      {figmaToken ? 'Connected securely' : 'Disconnected'}
                    </div>
                  </div>
                  {figmaToken ? (
                    <div className="flex items-center gap-3">
                      <span className="h-2 w-2 rounded-full bg-green-500"></span>
                      <button
                        onClick={disconnectFigma}
                        className="text-[9px] font-mono font-bold tracking-wider text-text-muted hover:text-accent uppercase underline bg-transparent"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={connectFigma}
                      className="text-[10px] font-mono tracking-wider font-semibold border border-accent text-accent rounded px-2.5 py-1 bg-transparent hover:bg-accent hover:text-bg-page transition"
                    >
                      CONNECT
                    </button>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-bg-card border border-border-card flex justify-between items-center">
                  <div>
                    <div className="text-xs font-semibold text-text-page">Miro REST Status</div>
                    <div className="text-[10px] text-text-muted">
                      {miroToken ? 'Connected securely' : 'Disconnected'}
                    </div>
                  </div>
                  {miroToken ? (
                    <div className="flex items-center gap-3">
                      <span className="h-2 w-2 rounded-full bg-green-500"></span>
                      <button
                        onClick={disconnectMiro}
                        className="text-[9px] font-mono font-bold tracking-wider text-text-muted hover:text-accent uppercase underline bg-transparent"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={connectMiro}
                      className="text-[10px] font-mono tracking-wider font-semibold border border-accent text-accent rounded px-2.5 py-1 bg-transparent hover:bg-accent hover:text-bg-page transition"
                    >
                      CONNECT
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-[10px] uppercase font-mono tracking-widest text-text-muted mb-2">
                Appearance
              </h4>
              <div className="p-3 rounded-lg bg-bg-card border border-border-card flex justify-between items-center">
                <span className="text-xs font-semibold text-text-page">Theme Select</span>
                <ThemeToggle />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Logger Board Status */}
      {syncStatus && (
        <footer className="mt-4 border-t border-border-card pt-4">
          <div className="p-2.5 rounded font-mono text-[10px] bg-bg-card border border-border-card text-amber-800 dark:text-yellow-400">
            {syncStatus}
          </div>
        </footer>
      )}
    </div>
  );
}
