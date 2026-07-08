'use client';

import { useEffect, useState } from 'react';
import { getValidToken, clearToken } from '@/lib/tokens';

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

  const handleDisconnect = (platform: 'figma' | 'miro') => {
    clearToken(platform);
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
    <main className="min-h-screen bg-[#0A0A0A] text-[#FAF9F5] font-sans selection:bg-[#01C8F1] selection:text-[#0A0A0A] p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[#1A1A1A] pb-6 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#01C8F1]">SyncBoard Dashboard</h1>
            <p className="text-sm text-[#9A9997]">Stateless Figma-Miro Workspace Controller</p>
          </div>
          
          {/* Integration Connections */}
          <div className="flex flex-wrap gap-3">
            <div className="px-4 py-2 rounded-lg bg-[#0F0F0F] border border-[#1A1A1A] flex items-center gap-3 text-xs">
              <span className={`h-2.5 w-2.5 rounded-full ${figmaToken ? 'bg-[#0FDFBA]' : 'bg-[#FFA27D]'}`}></span>
              <span>Figma</span>
              {figmaToken ? (
                <button onClick={() => handleDisconnect('figma')} className="text-[#9A9997] hover:text-[#FFA27D] font-semibold transition ml-2">Disconnect</button>
              ) : (
                <button onClick={connectFigma} className="text-[#01C8F1] hover:underline font-semibold transition ml-2">Connect</button>
              )}
            </div>
            
            <div className="px-4 py-2 rounded-lg bg-[#0F0F0F] border border-[#1A1A1A] flex items-center gap-3 text-xs">
              <span className={`h-2.5 w-2.5 rounded-full ${miroToken ? 'bg-[#0FDFBA]' : 'bg-[#FFA27D]'}`}></span>
              <span>Miro</span>
              {miroToken ? (
                <button onClick={() => handleDisconnect('miro')} className="text-[#9A9997] hover:text-[#FFA27D] font-semibold transition ml-2">Disconnect</button>
              ) : (
                <button onClick={connectMiro} className="text-[#01C8F1] hover:underline font-semibold transition ml-2">Connect</button>
              )}
            </div>
          </div>
        </header>

        {/* Sync status logging */}
        {syncStatus && (
          <div className="mb-6 p-3 rounded bg-[#0F0F0F] border border-[#1C1C1C] text-xs font-mono text-[#DEC75F]">
            {syncStatus}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Columns: Selected Screens Context */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-lg font-bold tracking-tight text-[#FAF9F5] flex items-center gap-2">
              Active Selection in Miro
              <span className="text-xs bg-[#1A1A1A] text-[#9A9997] px-2.5 py-0.5 rounded-full font-mono">{selectedMiroItems.length}</span>
            </h2>

            {selectedMiroItems.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {selectedMiroItems.map((item) => (
                  <div key={item.id} className="group relative rounded-xl bg-[#0F0F0F] border border-[#1A1A1A] overflow-hidden flex flex-col hover:border-[#2E2E2E] transition-all">
                    {/* Rendered Figma Preview */}
                    <div className="aspect-[16/9] w-full bg-[#1A1A1A] relative overflow-hidden flex items-center justify-center border-b border-[#1A1A1A]">
                      {figmaToken ? (
                        <img 
                          src={`/api/figma/render?fileKey=${item.fileKey}&nodeId=${item.nodeId}&token=${figmaToken}`}
                          alt={item.nodeName}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-xs text-[#9A9997] px-4 text-center">Connect Figma to load design preview</div>
                      )}
                    </div>

                    <div className="p-4 flex-grow flex flex-col justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-[#FAF9F5] line-clamp-1">{item.nodeName}</h3>
                        <p className="text-[10px] text-[#9A9997] font-mono mt-1">Figma ID: {item.nodeId}</p>
                      </div>
                      
                      <div className="mt-4 pt-3 border-t border-[#1C1C1C] flex justify-between items-center text-[10px] text-[#9A9997]">
                        <span>File: <span className="font-mono">{item.fileKey.slice(0, 8)}...</span></span>
                        <a 
                          href={`https://www.figma.com/file/${item.fileKey}?node-id=${item.nodeId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#01C8F1] hover:underline"
                        >
                          View in Figma →
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center rounded-xl border border-dashed border-[#1A1A1A] text-[#9A9997] flex flex-col items-center justify-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-[#5E5E5E]"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 17 5 12l4-5"/><path d="m15 17 4-5-4-5"/></svg>
                <div className="text-sm font-semibold">No synced Miro screens selected</div>
                <div className="text-xs max-w-sm">Open Miro, open the SyncBoard sidebar, and select any Figma screenshots on the board. They will instantly appear here.</div>
              </div>
            )}
          </div>

          {/* Right Column: Actions & Sync Controls */}
          <div className="space-y-6">
            <div className="p-6 rounded-xl bg-[#0F0F0F] border border-[#1A1A1A] space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-[#9A9997] font-mono">Sync Workspace</h3>
              
              <p className="text-xs text-[#9A9997] leading-relaxed">
                Clicking the button below requests a full in-place update for all screens currently selected on your Miro board.
              </p>

              <button
                onClick={triggerMiroSync}
                disabled={selectedMiroItems.length === 0}
                className="w-full font-mono font-bold text-xs py-3 rounded-lg bg-[#01C8F1] text-[#0A0A0A] hover:bg-[#00DFF6] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                SYNC SELECTION ({selectedMiroItems.length})
              </button>
            </div>
            
            <div className="p-6 rounded-xl bg-[#0F0F0F] border border-[#1A1A1A] space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#9A9997] font-mono">Developer Quickstart</h3>
              <p className="text-xs text-[#9A9997] leading-relaxed">
                To test the link-free Figma selection feature, open the Figma Desktop app in Dev Mode and make sure your local server is running.
              </p>
              <div className="text-[10px] font-mono bg-[#1A1A1A] p-3 rounded text-[#0FDFBA] break-all">
                curl http://127.0.0.1:3845/mcp
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
