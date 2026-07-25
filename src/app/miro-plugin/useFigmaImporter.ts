import { useState } from 'react';
import { parseFigmaUrl } from './figmaUrlParser';
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities';

export interface FigmaNodeInfo {
  fileKey: string;
  nodeId: string;
  name: string;
}

/**
 * Handles Figma URL validation, background API metadata querying,
 * local desktop selection detection, and canvas placement tasks.
 * Saves default format/scale configurations into the Miro image metadata.
 */
export function useFigmaImporter(
  figmaToken: string | null,
  miroToken: string | null,
  setIsSyncingParent: (val: boolean) => void,
  setSyncStatusParent: (val: string, type?: 'success' | 'error' | 'progress' | 'info') => void
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
        name: null as unknown as string,
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
                name: decodeHtmlEntities(data.name),
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
    
    const useTauri = typeof window !== 'undefined' && localStorage.getItem('syncboard_use_tauri') === 'true';
    if (useTauri) {
      try {
        const { callFigmaSelectionTauri } = await import('./companionRelayClient');
        const selection = await callFigmaSelectionTauri();
        if (selection) {
          setFigmaNodeInfo({
            fileKey: selection.fileKey,
            nodeId: selection.id,
            name: selection.name ? decodeHtmlEntities(selection.name) : 'Figma Screen',
          });
          setSyncStatusParent('Local Figma selection detected via SyncBridge!');
        } else {
          throw new Error('SyncBridge returned empty Figma selection details. Make sure your design file is open.');
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setSyncStatusParent(`SyncBridge Figma detection failed: ${errMsg}`);
      } finally {
        setIsDetectingLocal(false);
      }
      return;
    }

    try {
      const { callRelay, getOrCreatePairingId } = await import('./companionRelayClient');
      const pairingId = getOrCreatePairingId();

        if (!pairingId) {
          throw new Error('Pairing ID is not set. Enter a pairing ID in settings first.');
        }

        const data = await callRelay({
          pairingId,
          platform: 'figma',
          action: 'select',
          timeoutMs: 8_000,
        });

        const payload = data as { id?: string; name?: string; fileKey?: string } | null;
        if (payload && payload.id && payload.fileKey) {
          setFigmaNodeInfo({
            fileKey: payload.fileKey,
            nodeId: payload.id,
            name: payload.name ? decodeHtmlEntities(payload.name) : 'Figma Screen',
          });
          setSyncStatusParent(`Detected Figma companion frame: "${payload.name ? decodeHtmlEntities(payload.name) : 'Unnamed'}"`);
        } else {
          throw new Error('Figma companion returned empty selection. Make sure Figma is open and a frame is selected.');
        }
      } catch (relayErr: unknown) {
        const relayMsg = relayErr instanceof Error ? relayErr.message : String(relayErr);
        setSyncStatusParent(`Detection failed: ${relayMsg} (Tip: Open Figma Companion Plugin and connect using the same Pairing ID.)`);
        console.warn('Figma Relay selection fail:', relayErr);
      } finally {
      setIsDetectingLocal(false);
    }
  };

  const importFigmaScreen = async (format: 'png' | 'svg' = 'png', scale?: number) => {
    if (!figmaNodeInfo || !figmaToken) return;
    if (typeof window === 'undefined') return;
    const miro = window.miro;
    if (!miro) return;

    setIsSyncingParent(true);
    try {
      const viewport = await miro.board.viewport.get();
      const x = viewport.x + viewport.width / 2;
      const y = viewport.y + viewport.height / 2;

      // Read default scale settings from user's global settings configuration
      const resolvedScale = scale ?? (typeof window !== 'undefined' ? Number(localStorage.getItem('default_png_scale') || '2') : 2);

      setSyncStatusParent('Rendering Figma frame...', 'progress');

      // Use the same render-batch endpoint as sync to guarantee identical image data handling
      const batchRes = await fetch('/api/figma/render-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${figmaToken}`,
        },
        body: JSON.stringify({
          fileKey: figmaNodeInfo.fileKey,
          nodeIds: [figmaNodeInfo.nodeId],
          format,
          scale: resolvedScale,
        }),
      });
      if (!batchRes.ok) {
        const errData = await batchRes.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned HTTP ${batchRes.status}`);
      }
      const { images } = await batchRes.json() as { images: Record<string, string | null> };
      const dataUrl = images[figmaNodeInfo.nodeId];
      if (!dataUrl) {
        throw new Error('Figma batch render returned no image for the specified node.');
      }

      const fallbackName = figmaNodeInfo.name || figmaNodeInfo.nodeId;
      const safeName = decodeHtmlEntities(fallbackName);
      const titleTag = `${safeName} [SyncBoard|${figmaNodeInfo.fileKey}|${figmaNodeInfo.nodeId}]`;

      const image = await miro.board.createImage({
        url: dataUrl,
        title: titleTag,
        x,
        y,
      });

      try {
        if (typeof image.setMetadata !== 'function') {
          throw new Error("image.setMetadata is not a function on the returned object");
        }
        await image.setMetadata('syncboard', {
          fileKey: figmaNodeInfo.fileKey,
          nodeId: figmaNodeInfo.nodeId,
          nodeName: safeName,
          format,
          scale: resolvedScale,
        });
        await image.sync();

        // Non-blocking background registration of binary File resource on Miro backend
        // so that right-clicking and downloading the image from Miro uses the frame's actual name.
        // After the PATCH, re-assert the widget title via SDK — same pattern as sync/replace.
        if (miroToken) {
          const registerImage = async () => {
            try {
              const boardInfo = await miro.board.getInfo();
              const patchRes = await fetch('/api/miro/update-image', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${miroToken}`,
                },
                body: JSON.stringify({
                  boardId: boardInfo.id,
                  itemId: image.id,
                  dataUrl,
                  nodeName: safeName,
                  fileKey: figmaNodeInfo.fileKey,
                  nodeId: figmaNodeInfo.nodeId,
                  format,
                  scale: resolvedScale,
                  platform: 'figma',
                }),
              });
              if (patchRes.ok) {
                // Re-assert the widget title after PATCH to fix any server-side encoding
                const widget = await miro.board.getById(image.id).catch(() => null);
                if (widget) {
                  widget.title = `${safeName} [SyncBoard|${figmaNodeInfo.fileKey}|${figmaNodeInfo.nodeId}]`;
                  await widget.sync().catch(() => {});
                }
              }
            } catch (err) {
              console.warn('Background filename registration warning:', err);
            }
          };
          registerImage();
        }

        setSyncStatusParent('✓ Image placed successfully!', 'success');
        setIsSyncingParent(false);
      } catch (metaErr: unknown) {
        const metaMsg = metaErr instanceof Error ? metaErr.message : String(metaErr);
        console.error("Failed to write metadata during image creation:", metaErr);
        setSyncStatusParent(`Placement warning: Image created, but connection metadata failed to save (${metaMsg})`);
        setIsSyncingParent(false);
      }
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
