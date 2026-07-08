'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { getValidToken, saveToken, TokenData } from '@/lib/tokens';
import ThemeToggle from '@/components/ThemeToggle';

// Define types for Miro Web SDK v2
interface SyncedImage {
  id: string;
  title: string;
  fileKey: string;
  nodeId: string;
  nodeName: string;
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
      const handleOAuthMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'FIGMA_AUTH_SUCCESS') {
          setFigmaToken(event.data.tokens.accessToken);
          await saveToken('figma', event.data.tokens);
        }
        if (event.data?.type === 'MIRO_AUTH_SUCCESS') {
          setMiroToken(event.data.tokens.accessToken);
          await saveToken('miro', event.data.tokens);
        }
      };

      // Listen to BroadcastChannel for cross-tab updates
      const channel = new BroadcastChannel('oauth_callback');
      channel.onmessage = async (event) => {
        if (event.data?.type === 'FIGMA_AUTH_SUCCESS') {
          setFigmaToken(event.data.tokens.accessToken);
          await saveToken('figma', event.data.tokens);
        }
        if (event.data?.type === 'MIRO_AUTH_SUCCESS') {
          setMiroToken(event.data.tokens.accessToken);
          await saveToken('miro', event.data.tokens);
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

  // Handle Miro Web SDK Initialization and Event Listeners
  useEffect(() => {
    if (isInitMode === null) return;
    if (typeof window === 'undefined') return;

    let active = true;
    let interval: NodeJS.Timeout;

    const initMiro = async () => {
      const waitForMiro = (): Promise<any> => {
        return new Promise((resolve) => {
          if (window.miro) {
            resolve(window.miro);
            return;
          }
          interval = setInterval(() => {
            if (window.miro) {
              clearInterval(interval);
              resolve(window.miro);
            }
          }, 50);
        });
      };

      const miro = await waitForMiro();
      if (!active) return;

      if (isInitMode === true) {
        // Headless Initial mode: Register Toolbar Click
        miro.board.ui.on('icon:click', async () => {
          await miro.board.ui.openPanel({
            url: '/miro-plugin',
          });
        });
        console.log('SyncBoard Headless Iframe Initialized.');
      } else {
        // Panel Mode: Bind Selection Listeners
        const handleSelection = async () => {
          try {
            const selection = await miro.board.getSelection();
            console.log("SyncBoard Selection Event. Total items:", selection.length);
            const synced: SyncedImage[] = [];

            for (const item of selection) {
              console.log("Inspecting selected item ID:", item.id, "Type:", item.type);
              if (item.type === 'image') {
                try {
                  const metadata = await item.getMetadata();
                  console.log("Retrieved metadata for item:", item.id, metadata);
                  const syncData = metadata?.syncboard as { fileKey?: string; nodeId?: string; nodeName?: string } | undefined;
                  
                  if (syncData?.fileKey && syncData?.nodeId) {
                    console.log("SyncBoard metadata match found! FileKey:", syncData.fileKey, "NodeID:", syncData.nodeId);
                    synced.push({
                      id: item.id,
                      title: `[SyncBoard|${syncData.fileKey}|${syncData.nodeId}] ${syncData.nodeName || 'Unnamed Screen'}`,
                      fileKey: syncData.fileKey,
                      nodeId: syncData.nodeId,
                      nodeName: syncData.nodeName || 'Unnamed Screen',
                    });
                  } else {
                    console.log("Item lacks SyncBoard metadata");
                  }
                } catch (metaErr) {
                  console.error("Failed to read metadata for item:", item.id, metaErr);
                }
              }
            }

            if (!active) return;
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
        await handleSelection();

        // Listen for canvas selection updates
        miro.board.on('selection_updated', handleSelection);
      }
    };

    initMiro();

    return () => {
      active = false;
      if (interval) clearInterval(interval);
    };
  }, [isInitMode, figmaToken, miroToken]);

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
        const image = await miro.board.createImage({
          url: dataUrl,
          title: titleTag,
          x,
          y,
          width: 800, // standard display size
        });

        // 4. Attach metadata for robust selection detection
        await image.setMetadata('syncboard', {
          fileKey: figmaNodeInfo.fileKey,
          nodeId: figmaNodeInfo.nodeId,
          nodeName: figmaNodeInfo.name,
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
    setSyncStatus('Scanning board for copies...');

    try {
      const boardInfo = await miro.board.getInfo();
      const boardId = boardInfo.id;

      // 1. Scan the entire board to find all images that share the same figma keys as the selected ones
      const allItems = await miro.board.get();
      const imageItems = allItems.filter(item => item.type === 'image');

      // Fetch metadata in parallel for all images on the board to check for copies
      const imagesWithMetadata = await Promise.all(
        imageItems.map(async (item) => {
          try {
            const metadata = await item.getMetadata();
            const syncData = metadata?.syncboard as { fileKey?: string; nodeId?: string; nodeName?: string } | undefined;
            return { item, syncData };
          } catch (e) {
            return { item, syncData: undefined };
          }
        })
      );

      const itemsToSync: { id: string; fileKey: string; nodeId: string; nodeName: string; width?: number }[] = [];

      for (const selected of selectedItems) {
        // Find the selected item on the board as well as any duplicates/copies
        const matches = imagesWithMetadata.filter(pair => {
          return pair.syncData?.fileKey === selected.fileKey && pair.syncData?.nodeId === selected.nodeId;
        });

        for (const pair of matches) {
          itemsToSync.push({
            id: pair.item.id,
            fileKey: selected.fileKey,
            nodeId: selected.nodeId,
            nodeName: selected.nodeName,
            width: pair.item.width, // Preserve width of this specific copy
          });
        }
      }

      setSyncStatus(`Syncing ${itemsToSync.length} widget instance(s)...`);

      // 2. Perform the serverless sync updates for all matched instances
      for (let i = 0; i < itemsToSync.length; i++) {
        const item = itemsToSync[i];
        setSyncStatus(`Syncing screen instance ${i + 1}/${itemsToSync.length}: ${item.nodeName}`);

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
            width: item.width, // Pass the original width of this copy
          }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to update image on board');
        }
      }

      setSyncStatus('All matched screens updated in-place!');

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
          strategy="afterInteractive"
        />
        <div className="bg-bg-page h-screen"></div>
      </>
    );
  }

  // Headless mode is false: render Sidebar Panel
  return (
    <div className="flex flex-col min-h-screen p-5 bg-bg-page text-text-page font-sans selection:bg-accent selection:text-bg-page transition-colors duration-200">
      <Script
        src="https://miro.com/app/static/sdk/v2/miro.js"
        strategy="afterInteractive"
      />

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
              onChange={(e) => parseFigmaLink(e.target.value)}
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
