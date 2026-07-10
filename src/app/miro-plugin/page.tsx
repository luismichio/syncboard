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
    setSelectedItems,
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
    // Penpot Importer
    penpotInput,
    penpotNodeInfo,
    isDetectingPenpotLocal,
    parsePenpotLink,
    detectLocalPenpotSelection,
    importPenpotScreen,
    // Sync
    syncSelectedScreens,
    syncAllCopies,
    setSyncAllCopies,
  } = useMiroPlugin();

  const [activeTab, setActiveTab] = useState<'sync' | 'import' | 'settings'>('sync');
  const [importPlatform, setImportPlatform] = useState<'figma' | 'penpot'>('figma');
  const [defaultPngScale, setDefaultPngScale] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('default_png_scale');
      return saved ? Number(saved) : 2;
    }
    return 2;
  });

  const [useTauri, setUseTauri] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('syncboard_use_tauri') === 'true';
    }
    return false;
  });

  const [pairingId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      let id = localStorage.getItem('syncboard_pairing_id');
      if (!id) {
        id = 'sb_' + Math.random().toString(36).substring(2, 11) + Math.random().toString(36).substring(2, 11);
        localStorage.setItem('syncboard_pairing_id', id);
      }
      return id;
    }
    return '';
  });

  const [copiedPairing, setCopiedPairing] = useState<boolean>(false);

  const handleTauriToggle = (val: boolean) => {
    setUseTauri(val);
    localStorage.setItem('syncboard_use_tauri', val ? 'true' : 'false');
  };

  const copyPairingId = () => {
    navigator.clipboard.writeText(pairingId).then(() => {
      setCopiedPairing(true);
      setTimeout(() => setCopiedPairing(false), 2000);
    });
  };

  const handleDefaultPngScaleChange = (val: number) => {
    setDefaultPngScale(val);
    localStorage.setItem('default_png_scale', String(val));
  };

  interface GroupedSyncedImage {
    key: string;
    fileKey: string;
    nodeId: string;
    nodeName: string;
    format: 'png' | 'svg';
    scale: number;
    widgets: { id: string }[];
    platform: 'figma' | 'penpot';
  }

  const getGroupedItems = (): GroupedSyncedImage[] => {
    const groups: Record<string, GroupedSyncedImage> = {};
    for (const item of selectedItems) {
      const key = `${item.fileKey}|${item.nodeId}`;
      if (!groups[key]) {
        const plat = item.platform || 'figma';
        groups[key] = {
          key,
          fileKey: item.fileKey,
          nodeId: item.nodeId,
          nodeName: item.nodeName,
          format: item.format || (plat === 'penpot' ? 'svg' : 'png'),
          scale: item.scale || 2,
          widgets: [],
          platform: plat,
        };
      }
      groups[key].widgets.push({ id: item.id });
    }
    return Object.values(groups);
  };

  // Dynamically update format or scale directly to Miro metadata and React state for all group widgets
  const handleGroupSettingChange = async (itemIds: string[], key: 'format' | 'scale', value: unknown) => {
    if (typeof window === 'undefined') return;
    const miro = window.miro;
    if (!miro) return;

    try {
      const selection = await miro.board.getSelection();
      
      for (const itemId of itemIds) {
        const widget = selection.find(w => w.id === itemId);
        if (widget && widget.type === 'image') {
          const metadata = (await widget.getMetadata()) as Record<string, unknown> | undefined;
          const syncData = metadata?.syncboard as Record<string, unknown> | undefined;
          
          if (syncData) {
            const updated = {
              ...syncData,
              [key]: value
            };
            
            await widget.setMetadata('syncboard', updated);
            await widget.sync();
          }
        }
      }

      // Instantly update the local selection state to refresh the UI
      setSelectedItems((prev) =>
        prev.map((item) => {
          if (itemIds.includes(item.id)) {
            if (key === 'format') {
              return { ...item, format: value as 'png' | 'svg' };
            } else if (key === 'scale') {
              return { ...item, scale: value as number };
            }
          }
          return item;
        })
      );
    } catch (err) {
      console.error("Failed to update widgets settings:", err);
    }
  };

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
        <div className="flex items-center gap-2">
          {/* SyncBoard Logo */}
          <div
            className="w-6 h-6 bg-accent"
            style={{
              maskImage: 'url(/syncboard_logo.svg)',
              WebkitMaskImage: 'url(/syncboard_logo.svg)',
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              maskPosition: 'center',
            }}
          />
          <div>
            <h2 className="text-xl font-bold tracking-tight text-accent leading-none">SyncBoard</h2>
            <p className="text-[10px] text-text-muted mt-0.5">Stateless Design-Miro Pipeline</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Figma Status Indicator */}
          <div
            title={figmaToken ? "Figma Connected" : "Figma Disconnected"}
            className={`w-3.5 h-5 transition duration-200 ${figmaToken ? 'bg-accent' : 'bg-text-muted/30'}`}
            style={{
              maskImage: 'url(/Figma.svg)',
              WebkitMaskImage: 'url(/Figma.svg)',
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              maskPosition: 'center',
            }}
          />
          {/* Miro Status Indicator */}
          <div
            title={miroToken ? "Miro Connected" : "Miro Disconnected"}
            className={`w-4 h-4 transition duration-200 ${miroToken ? 'bg-accent' : 'bg-text-muted/30'}`}
            style={{
              maskImage: 'url(/Miro.svg)',
              WebkitMaskImage: 'url(/Miro.svg)',
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              maskPosition: 'center',
            }}
          />
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
                <div className="space-y-3">
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {getGroupedItems().map((group) => (
                      <div
                        key={group.key}
                        className="p-3 rounded-md bg-bg-card border border-border-card flex flex-col gap-2 relative animate-fade-in"
                      >
                        {/* Platform & Copy Counter Badges */}
                        <div className="absolute top-2 right-2 flex items-center gap-1.5">
                          {group.platform === 'penpot' ? (
                            <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-purple-400 bg-purple-950/40 border border-purple-800/40 px-1 py-0.5 rounded">
                              Penpot
                            </span>
                          ) : (
                            <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-green-400 bg-green-950/40 border border-green-800/40 px-1 py-0.5 rounded">
                              Figma
                            </span>
                          )}
                          {group.widgets.length > 1 && (
                            <span className="px-1.5 py-0.5 text-[8px] font-bold font-mono bg-accent/20 border border-accent/40 text-accent rounded-full">
                              x{group.widgets.length}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col pr-16">
                          <span className="text-xs font-semibold text-text-page truncate">
                            {group.nodeName}
                          </span>
                          <span className="text-[9px] font-mono text-text-muted truncate">
                            ID: {group.nodeId}
                          </span>
                        </div>

                        {/* Format and Scale Selectors */}
                        <div className="flex gap-2 mt-1 pt-2 border-t border-border-card/30">
                          <div className="flex-1 flex flex-col gap-0.5">
                            <span className="text-[8px] font-mono text-text-muted uppercase tracking-wider">Format</span>
                            <select
                              value={group.format}
                              onChange={(e) => handleGroupSettingChange(group.widgets.map(w => w.id), 'format', e.target.value as 'png' | 'svg')}
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
                                onChange={(e) => handleGroupSettingChange(group.widgets.map(w => w.id), 'scale', Number(e.target.value))}
                                className="bg-bg-page border border-border-card text-[10px] rounded px-1.5 py-0.5 focus:outline-none focus:border-accent text-text-page w-full cursor-pointer"
                              >
                                <option value="1">1x</option>
                                <option value="2">2x</option>
                                <option value="3">3x</option>
                                <option value="4">4x</option>
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
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
                    disabled={isSyncing || !miroToken}
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
        )}

        {/* Tab 2: Screen Importer */}
        {activeTab === 'import' && (
          <div className="flex-grow flex flex-col gap-4">
            {/* Platform selection segment */}
            <div className="flex rounded bg-bg-card p-0.5 border border-border-card">
              <button
                onClick={() => setImportPlatform('figma')}
                className={`flex-1 text-center font-mono py-1 text-[10px] font-bold rounded transition ${
                  importPlatform === 'figma'
                    ? 'bg-accent text-bg-page'
                    : 'text-text-muted hover:text-text-page'
                }`}
              >
                FIGMA
              </button>
              <button
                onClick={() => setImportPlatform('penpot')}
                className={`flex-1 text-center font-mono py-1 text-[10px] font-bold rounded transition ${
                  importPlatform === 'penpot'
                    ? 'bg-accent text-bg-page'
                    : 'text-text-muted hover:text-text-page'
                }`}
              >
                PENPOT
              </button>
            </div>

            {/* Importer Platform: Figma */}
            {importPlatform === 'figma' && (
              <div className="flex-grow flex flex-col justify-between">
                {figmaToken ? (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-[10px] uppercase font-mono tracking-widest text-text-muted mb-2">
                        Query Active Selection
                      </h4>
                      <button
                        onClick={detectLocalFigmaSelection}
                        disabled={isDetectingLocal}
                        className="w-full flex items-center justify-center gap-2 border border-border-card text-xs font-semibold rounded py-2 hover:bg-bg-card transition text-text-page cursor-pointer"
                      >
                        {isDetectingLocal ? 'Detecting...' : 'Detect Selection in Figma App'}
                      </button>
                    </div>
                    <div className="text-[10px] text-center text-text-muted">— or paste link manually —</div>
                    <div>
                      <h4 className="text-[10px] uppercase font-mono tracking-widest text-text-muted mb-2">
                        Paste Figma Frame Link
                      </h4>
                      <input
                        type="text"
                        value={figmaInput}
                        onChange={(e) => {
                          parseFigmaLink(e.target.value).catch((err) => {
                            console.error('Link parsing error:', err);
                          });
                        }}
                        className="w-full text-xs p-2.5 bg-bg-card border border-border-card rounded text-text-page focus:outline-none focus:border-accent"
                        placeholder="https://figma.com/file/..."
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
                          className="w-full mt-3 font-mono font-bold text-xs py-2 rounded bg-accent text-bg-page hover:opacity-90 transition cursor-pointer"
                        >
                          PLACE ON CANVAS
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8 rounded-md border border-dashed border-border-card text-center text-xs text-text-muted py-12 my-auto">
                    Please connect your Figma account in the Settings tab to import Figma frames.
                  </div>
                )}
              </div>
            )}

            {/* Importer Platform: Penpot */}
            {importPlatform === 'penpot' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-[10px] uppercase font-mono tracking-widest text-text-muted mb-2">
                    Query Active Selection
                  </h4>
                  <button
                    onClick={detectLocalPenpotSelection}
                    disabled={isDetectingPenpotLocal}
                    className="w-full flex items-center justify-center gap-2 border border-border-card text-xs font-semibold rounded py-2 hover:bg-bg-card transition text-text-page cursor-pointer"
                  >
                    {isDetectingPenpotLocal ? 'Detecting...' : 'Detect Selection in Penpot App'}
                  </button>
                </div>
                <div className="text-[10px] text-center text-text-muted">— or paste link manually —</div>
                <div>
                  <h4 className="text-[10px] uppercase font-mono tracking-widest text-text-muted mb-2">
                    Paste Penpot Frame Link
                  </h4>
                  <input
                    type="text"
                    value={penpotInput}
                    onChange={(e) => parsePenpotLink(e.target.value)}
                    className="w-full text-xs p-2.5 bg-bg-card border border-border-card rounded text-text-page focus:outline-none focus:border-accent"
                    placeholder="https://design.penpot.app/#/workspace/..."
                  />
                </div>
                {penpotNodeInfo && (
                  <div className="p-3 bg-bg-card rounded border border-border-card mt-3">
                    <div className="text-xs font-bold text-text-page truncate">
                      {penpotNodeInfo.name}
                    </div>
                    <div className="text-[9px] font-mono text-text-muted truncate">
                      File ID: {penpotNodeInfo.fileId}
                    </div>
                    <button
                      onClick={importPenpotScreen}
                      disabled={isSyncing}
                      className="w-full mt-3 font-mono font-bold text-xs py-2 rounded bg-accent text-bg-page hover:opacity-90 transition cursor-pointer"
                    >
                      PLACE ON CANVAS
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Settings & Preferences */}
        {activeTab === 'settings' && (
          <div className="flex-grow flex flex-col gap-6">
            <div>
              <h4 className="text-[10px] uppercase font-mono tracking-widest text-text-muted mb-2">
                Integrations
              </h4>
              <div className="space-y-2">
                {/* Figma Indicator Card */}
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

                {/* Miro Indicator Card */}
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

                {/* Tauri Desktop Bridge Card */}
                <div className="p-3 rounded-lg bg-bg-card border border-border-card flex justify-between items-center">
                  <div>
                    <div className="text-xs font-semibold text-text-page">Tauri Desktop Bridge</div>
                    <div className="text-[10px] text-text-muted">
                      {useTauri ? 'Local HTTPS loopback active' : 'Disabled (using direct MCP)'}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={useTauri}
                      onChange={(e) => handleTauriToggle(e.target.checked)}
                      className="accent-accent w-3.5 h-3.5"
                    />
                    <span className="text-[10px] text-text-muted font-mono uppercase tracking-wider">
                      {useTauri ? 'ON' : 'OFF'}
                    </span>
                  </label>
                </div>

                {useTauri ? (
                  /* Sync Pairing ID Card */
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
                      readOnly
                      value={pairingId}
                      className="w-full text-[10px] font-mono bg-bg-page border border-border-card rounded p-1.5 text-text-muted select-all focus:outline-none"
                    />
                    <p className="text-[9px] text-text-muted leading-tight mt-0.5">
                      Paste this pairing ID inside the Penpot Companion Plugin to connect the bridge.
                    </p>
                  </div>
                ) : (
                  /* Penpot Local MCP Indicator Card */
                  <div className="p-3 rounded-lg bg-bg-card border border-border-card flex justify-between items-center">
                    <div>
                      <div className="text-xs font-semibold text-text-page">Penpot Local MCP</div>
                      <div className="text-[10px] text-text-muted">
                        Listening on localhost:4401
                      </div>
                    </div>
                    <span className="px-2 py-0.5 text-[8px] font-mono font-bold bg-green-950/40 border border-green-800/40 text-green-400 rounded">
                      ACTIVE
                    </span>
                  </div>
                )}
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
                    onChange={(e) => handleDefaultPngScaleChange(Number(e.target.value))}
                    className="bg-bg-page border border-border-card text-xs rounded px-2 py-1 focus:outline-none focus:border-accent text-text-page cursor-pointer"
                  >
                    <option value="1">1x</option>
                    <option value="2">2x</option>
                    <option value="3">3x</option>
                    <option value="4">4x</option>
                  </select>
                </div>
                <div className="p-3 rounded-lg bg-bg-card border border-border-card flex justify-between items-center">
                  <span className="text-xs font-semibold text-text-page">Theme Select</span>
                  <ThemeToggle />
                </div>
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
