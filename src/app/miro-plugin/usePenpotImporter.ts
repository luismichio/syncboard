import { useState } from 'react';
import { parsePenpotUrl } from './penpotUrlParser';
import { callPenpotMcpTool, callRelay, getOrCreatePairingId } from './companionRelayClient';
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities';

export interface PenpotNodeInfo {
  fileId: string;
  objectId: string;
  name: string;
}

/**
 * Handles Penpot design URL validation, selection detection via Penpot Companion relay,
 * and vector asset canvas placement task.
 * Saves Penpot configuration and platform metadata in the Miro image widget.
 */
export function usePenpotImporter(
  miroToken: string | null,
  setIsSyncingParent: (val: boolean) => void,
  setSyncStatusParent: (val: string, type?: 'success' | 'error' | 'progress' | 'info') => void
) {
  const [penpotInput, setPenpotInput] = useState<string>('');
  const [penpotNodeInfo, setPenpotNodeInfo] = useState<PenpotNodeInfo | null>(null);
  const [isDetectingLocal, setIsDetectingLocal] = useState<boolean>(false);

  const parsePenpotLink = (url: string) => {
    setPenpotInput(url);
    const parsed = parsePenpotUrl(url);
    if (parsed) {
      setPenpotNodeInfo({
        fileId: parsed.fileId,
        objectId: parsed.objectId,
        name: 'Selected Frame',
      });
      setSyncStatusParent('Valid Penpot link detected.');
    } else {
      setPenpotNodeInfo(null);
    }
  };

  const detectLocalPenpotSelection = async () => {
    setIsDetectingLocal(true);

    try {
      const pairingId = getOrCreatePairingId();
      if (!pairingId) {
        throw new Error('Pairing ID is not set. Open settings and copy a valid pairing ID first.');
      }

      const data = await callRelay({
        pairingId,
        platform: 'penpot',
        action: 'select',
        timeoutMs: 8_000,
      });

      const payload = data as { id?: string; name?: string; fileId?: string } | null;
      if (!payload?.id) {
        throw new Error('No frame currently selected in Penpot.');
      }

      const fileId = payload.fileId || 'unknown-file';
      const nodeName = payload.name ? decodeHtmlEntities(payload.name) : 'Penpot Frame';

      setPenpotNodeInfo({
        fileId,
        objectId: payload.id,
        name: nodeName,
      });
      setSyncStatusParent(`Detected Penpot frame: "${nodeName}"`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setSyncStatusParent(`Detection failed: ${errMsg} (Tip: Open Penpot Companion Plugin and connect using the same Pairing ID.)`);
      console.warn('Local Penpot selection fail:', err);
    } finally {
      setIsDetectingLocal(false);
    }
  };

  const importPenpotScreen = async (format: 'png' | 'svg' = 'svg', scale: number = 2) => {
    if (!penpotNodeInfo) return;
    if (typeof window === 'undefined') return;
    const miro = window.miro;
    if (!miro) return;

    setIsSyncingParent(true);

    try {
      const viewport = await miro.board.viewport.get();
      const x = viewport.x + viewport.width / 2;
      const y = viewport.y + viewport.height / 2;

      const mcpResponse = await callPenpotMcpTool('export_shape', {
        shapeId: penpotNodeInfo.objectId,
        format,
        scale,
      });

      if (!mcpResponse.content || mcpResponse.content.length === 0) {
        throw new Error('Penpot relay returned empty export response.');
      }

      const content = mcpResponse.content[0];

      const responseName = content.name ? decodeHtmlEntities(content.name) : undefined;
      if (responseName && responseName !== 'Selected Frame') {
        setPenpotNodeInfo((prev) =>
          prev
            ? {
                ...prev,
                name: responseName,
              }
            : prev
        );
      }

      let dataUrl: string;
      if (content.type === 'image') {
        dataUrl = `data:${content.mimeType};base64,${content.data}`;
      } else {
        const svgText = content.text;
        if (!svgText) {
          throw new Error('Penpot relay returned empty SVG payload.');
        }
        const base64 = btoa(unescape(encodeURIComponent(svgText)));
        dataUrl = `data:image/svg+xml;base64,${base64}`;
      }

      const naturalWidth = content?.width;
      const naturalHeight = content?.height;

      const resolvedName = responseName && responseName !== 'Selected Frame'
        ? responseName
        : penpotNodeInfo.name ? decodeHtmlEntities(penpotNodeInfo.name) : 'Penpot Frame';

      const capturedFileId = penpotNodeInfo.fileId;
      const capturedObjectId = penpotNodeInfo.objectId;

      const titleTag = `${resolvedName} [PenpotSync|${capturedFileId}|${capturedObjectId}]`;

      const displayWidth = naturalWidth && naturalWidth > 0 && scale > 0
        ? Math.round(naturalWidth * scale)
        : undefined;

      const imageOptions: {
        url: string;
        title: string;
        x: number;
        y: number;
        width?: number;
      } = {
        url: dataUrl,
        title: titleTag,
        x,
        y,
      };

      if (displayWidth) imageOptions.width = displayWidth;

      const image = await miro.board.createImage(imageOptions);
      if (typeof image.setMetadata !== 'function') {
        throw new Error('image.setMetadata is not supported.');
      }

      await image.setMetadata('syncboard', {
        fileKey: capturedFileId,
        nodeId: capturedObjectId,
        nodeName: resolvedName,
        format,
        scale,
        platform: 'penpot',
        width: naturalWidth,
        height: naturalHeight,
      });
      await image.sync();

      if (miroToken) {
        const registerImage = async () => {
          try {
            const boardInfo = await miro.board.getInfo();
            const patchRes = await fetch('/api/miro/update-image', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${miroToken}`,
              },
              body: JSON.stringify({
                boardId: boardInfo.id,
                itemId: image.id,
                dataUrl,
                nodeName: resolvedName,
                fileKey: capturedFileId,
                nodeId: capturedObjectId,
                format,
                scale,
                platform: 'penpot',
              }),
            });
            if (patchRes.ok) {
              const widget = await miro.board.getById(image.id).catch(() => null);
              if (widget) {
                widget.title = `${resolvedName} [PenpotSync|${capturedFileId}|${capturedObjectId}]`;
                await widget.sync().catch(() => {});
              }
            }
          } catch (err) {
            console.warn('Background filename registration warning:', err);
          }
        };
        registerImage();
      }

      setSyncStatusParent('✓ Penpot vector screen placed successfully!', 'success');
      setIsSyncingParent(false);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setSyncStatusParent(`Import failed: ${errMsg}`);
      setIsSyncingParent(false);
    }
  };

  return {
    penpotInput,
    penpotNodeInfo,
    isDetectingLocal,
    parsePenpotLink,
    detectLocalPenpotSelection,
    importPenpotScreen,
  };
}
