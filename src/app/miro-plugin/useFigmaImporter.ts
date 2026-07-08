import { useState } from 'react';
import { parseFigmaUrl } from './figmaUrlParser';

export interface FigmaNodeInfo {
  fileKey: string;
  nodeId: string;
  name: string;
}

/**
 * Handles Figma URL validation, background API metadata querying,
 * local desktop selection detection, and canvas placement tasks.
 */
export function useFigmaImporter(
  figmaToken: string | null,
  setIsSyncingParent: (val: boolean) => void,
  setSyncStatusParent: (val: string) => void
) {
  const [figmaInput, setFigmaInput] = useState<string>('');
  const [figmaNodeInfo, setFigmaNodeInfo] = useState<FigmaNodeInfo | null>(null);
  const [isDetectingLocal, setIsDetectingLocal] = useState<boolean>(false);

  const parseFigmaLink = async (url: string) => {
    setFigmaInput(url);
    const parsed = parseFigmaUrl(url);
    if (parsed) {
      // Set temporary loading state
      setFigmaNodeInfo({
        fileKey: parsed.fileKey,
        nodeId: parsed.nodeId,
        name: 'Fetching frame name...',
      });

      if (figmaToken) {
        try {
          const res = await fetch(`/api/figma/node-info?fileKey=${parsed.fileKey}&nodeId=${parsed.nodeId}`, {
            headers: {
              Authorization: `Bearer ${figmaToken}`,
            },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.name) {
              setFigmaNodeInfo({
                fileKey: parsed.fileKey,
                nodeId: parsed.nodeId,
                name: data.name,
              });
              return;
            }
          }
        } catch (err) {
          console.error('Failed to fetch figma node name:', err);
        }
      }

      setFigmaNodeInfo({
        fileKey: parsed.fileKey,
        nodeId: parsed.nodeId,
        name: 'Pasted Screen',
      });
    } else {
      setFigmaNodeInfo(null);
    }
  };

  const detectLocalFigmaSelection = async () => {
    setIsDetectingLocal(true);
    setSyncStatusParent('Detecting local Figma selection...');
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

      const fileKey = result.result.content[0].text.match(/fileKey:\s*([a-zA-Z0-9]+)/)?.[1];
      const nodeId = result.result.content[0].text.match(/nodeId:\s*([a-zA-Z0-9\-:]+)/)?.[1];
      const name = result.result.content[0].text.match(/name:\s*([^\n]+)/)?.[1] || 'Figma Screen';

      if (fileKey && nodeId) {
        setFigmaNodeInfo({ fileKey, nodeId, name });
        setSyncStatusParent('Local selection detected successfully!');
      } else {
        throw new Error('Figma MCP returned empty selection details.');
      }
    } catch (err: unknown) {
      setSyncStatusParent('Local server not found. Paste link manually below.');
      console.warn('Local Figma MCP fail:', err);
    } finally {
      setIsDetectingLocal(false);
    }
  };

  const importFigmaScreen = async () => {
    if (!figmaNodeInfo || !figmaToken) return;
    if (typeof window === 'undefined') return;
    const miro = window.miro;
    if (!miro) return;

    setIsSyncingParent(true);
    setSyncStatusParent('Rendering and placing screen...');

    try {
      const viewport = await miro.board.viewport.get();
      const x = viewport.x + viewport.width / 2;
      const y = viewport.y + viewport.height / 2;

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
        const titleTag = `[SyncBoard|${figmaNodeInfo.fileKey}|${figmaNodeInfo.nodeId}] ${figmaNodeInfo.name}`;
        const image = await miro.board.createImage({
          url: dataUrl,
          title: titleTag,
          x,
          y,
          width: 800,
        });

        try {
          console.log("Setting syncboard metadata on new image:", image.id);
          if (typeof image.setMetadata !== 'function') {
            throw new Error("image.setMetadata is not a function on the returned object");
          }
          await image.setMetadata('syncboard', {
            fileKey: figmaNodeInfo.fileKey,
            nodeId: figmaNodeInfo.nodeId,
            nodeName: figmaNodeInfo.name,
          });
          await image.sync();
          console.log("Metadata synchronized successfully!");

          setSyncStatusParent('Image placed successfully!');
          setIsSyncingParent(false);
        } catch (metaErr: unknown) {
          const metaMsg = metaErr instanceof Error ? metaErr.message : String(metaErr);
          console.error("Failed to write metadata during image creation:", metaErr);
          setSyncStatusParent(`Placement warning: Image created, but connection metadata failed to save (${metaMsg})`);
          setIsSyncingParent(false);
        }
      };

      reader.readAsDataURL(blob);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setSyncStatusParent(`Import failed: ${errMsg}`);
      setIsSyncingParent(false);
    }
  };

  return {
    figmaInput,
    figmaNodeInfo,
    isDetectingLocal,
    parseFigmaLink,
    detectLocalFigmaSelection,
    importFigmaScreen,
  };
}
