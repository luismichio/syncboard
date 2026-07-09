'use client';

import { useEffect, useState } from 'react';
import { getValidToken, clearToken } from '@/lib/tokens';
import ThemeToggle from '@/components/ThemeToggle';

interface SyncedImage {
  id: string;
  title: string;
  fileKey: string;
  nodeId: string;
  nodeName: string;
}

export default function DashboardPage() {
  const [figmaToken, setFigmaToken] = useState<string | null>(null);
  const [miroToken, setMiroToken] = useState<string | null>(null);
  const [selectedMiroItems, setSelectedMiroItems] = useState<SyncedImage[]>([]);
  const [syncStatus, setSyncStatus] = useState<string>('');

  useEffect(() => {
    // 1. Fetch credentials
    const fetchTokens = async () => {
      const fToken = await getValidToken('figma');
      const mToken = await getValidToken('miro');
      setFigmaToken(fToken);
      setMiroToken(mToken);
    };
    fetchTokens();

    // 2. Setup BroadcastChannel to communicate with the Miro plugin iframe
    const syncChannel = new BroadcastChannel('figma_miro_sync');
    const oauthChannel = new BroadcastChannel('oauth_callback');

    // Listen for events from the Miro board iframe
    syncChannel.onmessage = (event) => {
      const { type, selection } = event.data;
      if (type === 'SELECTION_CHANGED') {
        setSelectedMiroItems(selection || []);
      }
      if (type === 'SYNC_COMPLETE') {
        setSyncStatus('Sync complete! Miro board is up to date.');
        setTimeout(() => setSyncStatus(''), 4000);
      }
      if (type === 'SYNC_ERROR') {
        setSyncStatus(`Sync failed: ${event.data.error}`);
      }
    };

    // Listen for OAuth logins
    oauthChannel.onmessage = (event) => {
      if (event.data?.type === 'FIGMA_AUTH_SUCCESS') {
        setFigmaToken(event.data.tokens.accessToken);
      }
      if (event.data?.type === 'MIRO_AUTH_SUCCESS') {
        setMiroToken(event.data.tokens.accessToken);
      }
    };

    return () => {
      syncChannel.close();
      oauthChannel.close();
    };
  }, []);

  const connectFigma = () => {
    const width = 600;
    const height = 700;
    window.open(
      '/api/oauth/figma/auth',
      'Connect Figma',
      `width=${width},height=${height},top=100,left=100`
    );
  };

  const connectMiro = () => {
    const width = 600;
    const height = 700;
    window.open(
      '/api/oauth/miro/auth',
      'Connect Miro',
      `width=${width},height=${height},top=100,left=100`
    );
  };

  const handleDisconnect = async (platform: 'figma' | 'miro') => {
    await clearToken(platform);
    if (platform === 'figma') setFigmaToken(null);
    if (platform === 'miro') setMiroToken(null);
  };

  const triggerMiroSync = () => {
    if (selectedMiroItems.length === 0) return;
    setSyncStatus('Requesting Miro board sync...');
    
    // Broadcast the sync request back to the Miro plugin iframe
    const syncChannel = new BroadcastChannel('figma_miro_sync');
    syncChannel.postMessage({ type: 'SYNC_REQUESTED' });
    syncChannel.close();
  };

  return (
    <main className="min-h-screen bg-bg-page text-text-page font-sans selection:bg-accent selection:text-bg-page p-8 transition-colors duration-200">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border-card pb-6 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-accent">SyncBoard Dashboard</h1>
            <p className="text-sm text-text-muted">Stateless Figma-Miro Workspace Controller</p>
          </div>
          
          {/* Integration Connections & Theme Toggle */}
          <div className="flex flex-wrap gap-3 items-center">
            <ThemeToggle />

            <div className="px-4 py-2 rounded-lg bg-bg-card border border-border-card flex items-center gap-3 text-xs">
              <span className={`h-2.5 w-2.5 rounded-full ${figmaToken ? 'bg-green-500' : 'bg-red-400'}`}></span>
              <span>Figma</span>
              {figmaToken ? (
                <button onClick={() => handleDisconnect('figma')} className="text-text-muted hover:text-red-400 font-semibold transition ml-2">Disconnect</button>
              ) : (
                <button onClick={connectFigma} className="text-accent hover:underline font-semibold transition ml-2">Connect</button>
              )}
            </div>
            
            <div className="px-4 py-2 rounded-lg bg-bg-card border border-border-card flex items-center gap-3 text-xs">
              <span className={`h-2.5 w-2.5 rounded-full ${miroToken ? 'bg-green-500' : 'bg-red-400'}`}></span>
              <span>Miro</span>
              {miroToken ? (
                <button onClick={() => handleDisconnect('miro')} className="text-text-muted hover:text-red-400 font-semibold transition ml-2">Disconnect</button>
              ) : (
                <button onClick={connectMiro} className="text-accent hover:underline font-semibold transition ml-2">Connect</button>
              )}
            </div>
          </div>
        </header>

        {/* Sync status logging */}
        {syncStatus && (
          <div className="mb-6 p-3 rounded bg-bg-card border border-border-card text-xs font-mono text-amber-800 dark:text-yellow-400">
            {syncStatus}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Columns: Selected Screens Context */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-lg font-bold tracking-tight text-text-page flex items-center gap-2">
              Active Selection in Miro
              <span className="text-xs bg-bg-card text-text-muted px-2.5 py-0.5 rounded-full font-mono border border-border-card">{selectedMiroItems.length}</span>
            </h2>

            {selectedMiroItems.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {selectedMiroItems.map((item) => (
                  <div key={item.id} className="group relative rounded-xl bg-bg-card border border-border-card overflow-hidden flex flex-col hover:border-text-muted/40 transition-all">
                    {/* Rendered Figma Preview */}
                    <div className="aspect-[16/9] w-full bg-bg-page relative overflow-hidden flex items-center justify-center border-b border-border-card">
                      {figmaToken ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img 
                          src={`/api/figma/render?fileKey=${item.fileKey}&nodeId=${item.nodeId}&token=${figmaToken}`}
                          alt={item.nodeName}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-xs text-text-muted px-4 text-center">Connect Figma to load design preview</div>
                      )}
                    </div>

                    <div className="p-4 flex-grow flex flex-col justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-text-page line-clamp-1">{item.nodeName}</h3>
                        <p className="text-[10px] text-text-muted font-mono mt-1">Figma ID: {item.nodeId}</p>
                      </div>
                      
                      <div className="mt-4 pt-3 border-t border-border-card flex justify-between items-center text-[10px] text-text-muted">
                        <span>File: <span className="font-mono">{item.fileKey.slice(0, 8)}...</span></span>
                        <a 
                          href={`https://www.figma.com/file/${item.fileKey}?node-id=${item.nodeId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent hover:underline"
                        >
                          View in Figma →
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center rounded-xl border border-dashed border-border-card text-text-muted flex flex-col items-center justify-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-text-muted"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 17 5 12l4-5"/><path d="m15 17 4-5-4-5"/></svg>
                <div className="text-sm font-semibold">No synced Miro screens selected</div>
                <div className="text-xs max-w-sm">Open Miro, open the SyncBoard sidebar, and select any Figma screenshots on the board. They will instantly appear here.</div>
              </div>
            )}
          </div>

          {/* Right Column: Actions & Sync Controls */}
          <div className="space-y-6">
            <div className="p-6 rounded-xl bg-bg-card border border-border-card space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted font-mono">Sync Workspace</h3>
              
              <p className="text-xs text-text-muted leading-relaxed">
                Clicking the button below requests a full in-place update for all screens currently selected on your Miro board.
              </p>

              <button
                onClick={triggerMiroSync}
                disabled={selectedMiroItems.length === 0}
                className="w-full font-mono font-bold text-xs py-3 rounded-lg bg-accent text-bg-page hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                SYNC SELECTION ({selectedMiroItems.length})
              </button>
            </div>
            
            <div className="p-6 rounded-xl bg-bg-card border border-border-card space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted font-mono">Developer Quickstart</h3>
              <p className="text-xs text-text-muted leading-relaxed">
                To test the link-free Figma selection feature, open the Figma Desktop app in Dev Mode and make sure your local server is running.
              </p>
              <div className="text-[10px] font-mono bg-bg-page p-3 rounded text-green-500 dark:text-green-400 break-all border border-border-card">
                curl http://127.0.0.1:3845/mcp
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
