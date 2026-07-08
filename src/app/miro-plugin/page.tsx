'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { getValidToken, saveToken, TokenData } from '@/lib/tokens';

// Define types for Miro Web SDK v2
interface MiroViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SyncedImage {
  id: string;
  title: string;
  fileKey: string;
  nodeId: string;
  nodeName: string;
}

interface MiroItem {
  id: string;
  type: string;
  title?: string;
}

interface MiroBoardInfo {
  id: string;
}

interface MiroBoard {
  getSelection(): Promise<MiroItem[]>;
  on(event: string, callback: () => void): void;
  viewport: {
    get(): Promise<MiroViewport>;
  };
  createImage(options: {
    url: string;
    title?: string;
    x?: number;
    y?: number;
    width?: number;
  }): Promise<MiroItem>;
  getInfo(): Promise<MiroBoardInfo>;
  ui: {
    on(event: string, callback: () => void): void;
    openPanel(options: { url: string }): Promise<void>;
  };
}

declare global {
  interface Window {
    miro?: {
      board: MiroBoard;
    };
  }
}

export default function MiroPluginPage() {
  const [isInitMode, setIsInitMode] = useState<boolean | null>(null);
  const [figmaToken, setFigmaToken] = useState<string | null>(null);
  const [miroToken, setMiroToken] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<SyncedImage[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string>('');

  // Figma Import States
  const [figmaInput, setFigmaInput] = useState<string>('');
  const [figmaNodeInfo, setFigmaNodeInfo] = useState<{
    fileKey: string;
    nodeId: string;
    name: string;
  } | null>(null);
  const [isDetectingLocal, setIsDetectingLocal] = useState<boolean>(false);

  useEffect(() => {
    // 1. Detect if we are in headless init mode or sidebar panel mode
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setIsInitMode(params.get('init') === 'true');
    }
  }, []);

  // Fetch local credentials on mount
  useEffect(() => {
    if (isInitMode === false) {
      const fetchTokens = async () => {
        const fToken = await getValidToken('figma');
        const mToken = await getValidToken('miro');
        setFigmaToken(fToken);
        setMiroToken(mToken);
      };
      fetchTokens();

      // Listen for successful OAuth callback popups
      const handleOAuthMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'FIGMA_AUTH_SUCCESS') {
          setFigmaToken(event.data.tokens.accessToken);
        }
        if (event.data?.type === 'MIRO_AUTH_SUCCESS') {
          setMiroToken(event.data.tokens.accessToken);
        }
      };

      // Listen to BroadcastChannel for cross-tab updates
      const channel = new BroadcastChannel('oauth_callback');
      channel.onmessage = (event) => {
        if (event.data?.type === 'FIGMA_AUTH_SUCCESS') {
          setFigmaToken(event.data.tokens.accessToken);
        }
        if (event.data?.type === 'MIRO_AUTH_SUCCESS') {
          setMiroToken(event.data.tokens.accessToken);
        }
      };

      window.addEventListener('message', handleOAuthMessage);
      return () => {
        window.removeEventListener('message', handleOAuthMessage);
        channel.close();
      };
    }
  }, [isInitMode]);

  // Listen to the sync channel for remote sync triggers from the dashboard tab
  useEffect(() => {
    if (isInitMode === false) {
      const syncChannel = new BroadcastChannel('figma_miro_sync');
      
      syncChannel.onmessage = async (event) => {
        const { type } = event.data;
        if (type === 'SYNC_REQUESTED') {
          await syncSelectedScreens();
        }
      };

      return () => syncChannel.close();
    }
  }, [isInitMode, selectedItems, figmaToken, miroToken]);

  // Handle Miro Web SDK Initialization
  const onMiroScriptLoad = () => {
    if (typeof window === 'undefined') return;
    const miro = window.miro;
    if (!miro) return;

    if (isInitMode === true) {
      // Headless Initial mode: Register Toolbar Click
      miro.board.ui.on('icon:click', async () => {
        await miro.board.ui.openPanel({
          url: '/miro-plugin',
        });
      });
      console.log('SyncBoard Headless Iframe Initialized.');
    } else if (isInitMode === false) {
      // Panel Mode: Bind Selection Listeners
      const handleSelection = async () => {
        try {
          const selection = await miro.board.getSelection();
          const synced: SyncedImage[] = [];

          for (const item of selection) {
            // Check if it is an image widget and has our title tag [SyncBoard|fileKey|nodeId] NodeName
            if (item.type === 'image' && item.title) {
              const match = item.title.match(/^\[SyncBoard\|([^|]+)\|([^\]]+)\]\s*(.*)$/);
              if (match) {
                synced.push({
                  id: item.id,
                  title: item.title,
                  fileKey: match[1],
                  nodeId: match[2],
                  nodeName: match[3] || 'Unnamed Screen',
                });
              }
            }
          }
          setSelectedItems(synced);

          // Broadcast selection updates to the external dashboard tab
          try {
            const syncChannel = new BroadcastChannel('figma_miro_sync');
            syncChannel.postMessage({ type: 'SELECTION_CHANGED', selection: synced });
            syncChannel.close();
          } catch (e) {
            console.error('Failed to broadcast selection:', e);
          }
        } catch (err) {
          console.error('Failed to get selection:', err);
        }
      };

      // Query current selection on load
      handleSelection();

      // Listen for canvas selection updates
      miro.board.on('selection_updated', handleSelection);
    }
  };

  // Triggers Figma OAuth Popup window
  const connectFigma = () => {
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    window.open(
      '/api/oauth/figma/auth',
      'Connect Figma',
      `width=${width},height=${height},top=${top},left=${left}`
    );
  };

  // Triggers Miro OAuth Popup window
  const connectMiro = () => {
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    window.open(
      '/api/oauth/miro/auth',
      'Connect Miro',
      `width=${width},height=${height},top=${top},left=${left}`
    );
  };

  // Parse a pasted Figma URL to extract key and nodeId
  const parseFigmaLink = (url: string) => {
    setFigmaInput(url);
    if (!url) {
      setFigmaNodeInfo(null);
      return;
    }

    try {
      // Matches /file/FILE_KEY/ or /design/FILE_KEY/
      const fileMatch = url.match(/(?:file|design)\/([a-zA-Z0-9]+)\//);
      // Matches node-id=NODE_ID
      const nodeMatch = url.match(/node-id=([a-zA-Z0-9\-:]+)/);

      if (fileMatch && nodeMatch) {
        setFigmaNodeInfo({
          fileKey: fileMatch[1],
          nodeId: nodeMatch[1].replace('-', ':'), // Figma API uses colons, URLs use hyphens
          name: 'Pasted Screen',
        });
      } else {
        setFigmaNodeInfo(null);
      }
    } catch (e) {
      setFigmaNodeInfo(null);
    }
  };

  // Try to query local Figma Desktop MCP Server for current active selection
  const detectLocalFigmaSelection = async () => {
    setIsDetectingLocal(true);
    setSyncStatus('Detecting local Figma selection...');
    try {
      const response = await fetch('http://127.0.0.1:3845/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'get_design_context',
            arguments: {},
          },
          id: 1,
        }),
      });

      if (!response.ok) {
        throw new Error('Local Figma MCP server not running or CORS blocked.');
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message || 'Failed to fetch design context');
      }

      // Read values from the Figma Desktop MCP tool response
      const fileKey = result.result.content[0].text.match(/fileKey:\s*([a-zA-Z0-9]+)/)?.[1];
      const nodeId = result.result.content[0].text.match(/nodeId:\s*([a-zA-Z0-9\-:]+)/)?.[1];
      const name = result.result.content[0].text.match(/name:\s*([^\n]+)/)?.[1] || 'Figma Screen';

      if (fileKey && nodeId) {
        setFigmaNodeInfo({ fileKey, nodeId, name });
        setSyncStatus('Local selection detected successfully!');
      } else {
        throw new Error('Figma MCP returned empty selection details.');
      }
    } catch (err: any) {
      setSyncStatus('Local server not found. Paste link manually below.');
      console.warn('Local Figma MCP fail:', err);
    } finally {
      setIsDetectingLocal(false);
    }
  };

  // Places the selected figma screen on the Miro board
  const importFigmaScreen = async () => {
    if (!figmaNodeInfo || !figmaToken) return;
    if (typeof window === 'undefined') return;
    const miro = window.miro;
    if (!miro) return;

    setIsSyncing(true);
    setSyncStatus('Rendering and placing screen...');

    try {
      // 1. Get Miro viewport to place image in the center
      const viewport: MiroViewport = await miro.board.viewport.get();
      const x = viewport.x + viewport.width / 2;
      const y = viewport.y + viewport.height / 2;

      // 2. Fetch the image from render proxy as a Blob, then load as DataURL
      const proxyUrl = `/api/figma/render?fileKey=${figmaNodeInfo.fileKey}&nodeId=${figmaNodeInfo.nodeId}`;
      const response = await fetch(proxyUrl, {
        headers: {
          Authorization: `Bearer ${figmaToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch image render from server proxy');
      }

      const blob = await response.blob();
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        const dataUrl = reader.result as string;

        // 3. Create image directly inside Miro board
        const titleTag = `[SyncBoard|${figmaNodeInfo.fileKey}|${figmaNodeInfo.nodeId}] ${figmaNodeInfo.name}`;
        await miro.board.createImage({
          url: dataUrl,
          title: titleTag,
          x,
          y,
          width: 800, // standard display size
        });

        setSyncStatus('Image placed successfully!');
        setIsSyncing(false);
      };

      reader.readAsDataURL(blob);
    } catch (err: any) {
      setSyncStatus(`Import failed: ${err.message}`);
      setIsSyncing(false);
    }
  };

  // Syncs all selected frames on the board
  const syncSelectedScreens = async () => {
    if (selectedItems.length === 0 || !figmaToken || !miroToken) return;
    if (typeof window === 'undefined') return;
    const miro = window.miro;
    if (!miro) return;

    setIsSyncing(true);
    setSyncStatus(`Syncing ${selectedItems.length} screen(s)...`);

    try {
      const boardInfo = await miro.board.getInfo();
      const boardId = boardInfo.id;

      for (let i = 0; i < selectedItems.length; i++) {
        const item = selectedItems[i];
        setSyncStatus(`Syncing screen ${i + 1}/${selectedItems.length}: ${item.nodeName}`);

        const response = await fetch('/api/miro/update-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            figmaToken,
            miroToken,
            boardId,
            itemId: item.id,
            fileKey: item.fileKey,
            nodeId: item.nodeId,
            nodeName: item.nodeName,
          }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to update image on board');
        }
      }

      setSyncStatus('All selected screens updated in-place!');

      // Broadcast sync complete status
      try {
        const syncChannel = new BroadcastChannel('figma_miro_sync');
        syncChannel.postMessage({ type: 'SYNC_COMPLETE' });
        syncChannel.close();
      } catch (e) {}
    } catch (err: any) {
      setSyncStatus(`Sync failed: ${err.message}`);

      // Broadcast sync error status
      try {
        const syncChannel = new BroadcastChannel('figma_miro_sync');
        syncChannel.postMessage({ type: 'SYNC_ERROR', error: err.message || err });
        syncChannel.close();
      } catch (e) {}
    } finally {
      setIsSyncing(false);
    }
  };

  if (isInitMode === null) {
    return null; // Server hydration fallback
  }

  // Headless mode returns empty loader page
  if (isInitMode === true) {
    return (
      <>
        <Script
          src="https://miro.com/app/static/sdk/v2/miro.js"
          onLoad={onMiroScriptLoad}
        />
        <div style={{ background: '#0A0A0A', height: '100vh' }}></div>
      </>
    );
  }

  // Headless mode is false: render Sidebar Panel
  return (
    <div className="flex flex-col min-h-screen p-5 bg-[#0A0A0A] text-[#FAF9F5] font-sans selection:bg-[#01C8F1] selection:text-[#0A0A0A]">
      <Script
        src="https://miro.com/app/static/sdk/v2/miro.js"
        onLoad={onMiroScriptLoad}
      />

      <header className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-[#01C8F1]">SyncBoard</h2>
        <p className="text-xs text-[#9A9997]">Stateless Figma-Miro Pipeline</p>
      </header>

      {/* 1. Connection Status Panels */}
      <section className="mb-6 space-y-3">
        <div className="p-3 rounded-lg bg-[#0F0F0F] border border-[#1A1A1A] flex justify-between items-center">
          <div>
            <div className="text-xs font-semibold text-[#FAF9F5]">Figma Status</div>
            <div className="text-[10px] text-[#9A9997]">
              {figmaToken ? 'Connected securely' : 'Token expired or disconnected'}
            </div>
          </div>
          {figmaToken ? (
            <span className="h-2 w-2 rounded-full bg-[#0FDFBA]"></span>
          ) : (
            <button
              onClick={connectFigma}
              className="text-[11px] font-mono tracking-wider font-semibold border border-[#01C8F1] text-[#01C8F1] rounded px-2.5 py-1 bg-transparent hover:bg-[#01C8F1] hover:text-[#0A0A0A] transition"
            >
              CONNECT
            </button>
          )}
        </div>

        <div className="p-3 rounded-lg bg-[#0F0F0F] border border-[#1A1A1A] flex justify-between items-center">
          <div>
            <div className="text-xs font-semibold text-[#FAF9F5]">Miro REST Status</div>
            <div className="text-[10px] text-[#9A9997]">
              {miroToken ? 'Connected securely' : 'Token expired or disconnected'}
            </div>
          </div>
          {miroToken ? (
            <span className="h-2 w-2 rounded-full bg-[#0FDFBA]"></span>
          ) : (
            <button
              onClick={connectMiro}
              className="text-[11px] font-mono tracking-wider font-semibold border border-[#01C8F1] text-[#01C8F1] rounded px-2.5 py-1 bg-transparent hover:bg-[#01C8F1] hover:text-[#0A0A0A] transition"
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
            <h4 className="text-xs uppercase font-mono tracking-widest text-[#9A9997]">
              Canvas Selection
            </h4>
            <span className="text-[10px] font-mono bg-[#1A1A1A] text-[#9A9997] px-2 py-0.5 rounded">
              {selectedItems.length} Matched
            </span>
          </div>

          {selectedItems.length > 0 ? (
            <div className="space-y-2 mb-4">
              {selectedItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-md bg-[#1A1A1A] border border-[#2E2E2E] flex flex-col gap-1"
                >
                  <span className="text-xs font-semibold text-[#FAF9F5]">
                    {item.nodeName}
                  </span>
                  <span className="text-[9px] font-mono text-[#9A9997]">
                    Node: {item.nodeId}
                  </span>
                </div>
              ))}
              <button
                onClick={syncSelectedScreens}
                disabled={isSyncing || !figmaToken || !miroToken}
                className="w-full mt-2 font-mono font-bold text-xs py-2.5 rounded bg-[#01C8F1] text-[#0A0A0A] hover:bg-[#00DFF6] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                SYNC SELECTED SCREENS
              </button>
            </div>
          ) : (
            <div className="p-5 rounded-md border border-dashed border-[#2E2E2E] text-center text-xs text-[#9A9997]">
              Select one or more synced images on the canvas to update them in-place.
            </div>
          )}
        </div>

        {/* 3. Screen Importer */}
        {figmaToken && (
          <div className="border-t border-[#1A1A1A] pt-5">
            <h4 className="text-xs uppercase font-mono tracking-widest text-[#9A9997] mb-3">
              Import Figma Screen
            </h4>

            {/* A. Local Figma selection hook */}
            <button
              onClick={detectLocalFigmaSelection}
              disabled={isDetectingLocal}
              className="w-full mb-3 flex items-center justify-center gap-2 border border-[#5E5E5E] text-xs font-semibold rounded py-2 hover:bg-[#1A1A1A] transition text-[#FAF9F5]"
            >
              {isDetectingLocal ? 'Detecting...' : 'Detect Selection in Figma App'}
            </button>

            <div className="text-[10px] text-center text-[#9A9997] mb-3">or</div>

            {/* B. Manual link input */}
            <input
              type="text"
              placeholder="Paste Figma frame link..."
              value={figmaInput}
              onChange={(e) => parseFigmaLink(e.target.value)}
              className="w-full text-xs p-2.5 bg-[#0F0F0F] border border-[#1A1A1A] rounded text-[#FAF9F5] focus:outline-none focus:border-[#01C8F1] mb-3"
            />

            {figmaNodeInfo && (
              <div className="p-3 bg-[#1A1A1A] rounded border border-[#2E2E2E] mb-3">
                <div className="text-xs font-bold text-[#FAF9F5] truncate">
                  {figmaNodeInfo.name}
                </div>
                <div className="text-[9px] font-mono text-[#9A9997] truncate">
                  File: {figmaNodeInfo.fileKey}
                </div>
                <button
                  onClick={importFigmaScreen}
                  disabled={isSyncing}
                  className="w-full mt-3 font-mono font-bold text-xs py-2 rounded bg-[#01C8F1] text-[#0A0A0A] hover:bg-[#00DFF6] transition"
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
        <footer className="mt-auto border-t border-[#1A1A1A] pt-4">
          <div className="p-2.5 rounded font-mono text-[10px] bg-[#0F0F0F] border border-[#1C1C1C] text-[#DEC75F]">
            {syncStatus}
          </div>
        </footer>
      )}
    </div>
  );
}
