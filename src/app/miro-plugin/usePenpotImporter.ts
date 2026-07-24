import { useState } from 'react';
import { parsePenpotUrl } from './penpotUrlParser';
import { callPenpotMcpTool } from './companionRelayClient';

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
    setSyncStatusParent('Detecting selection from Penpot companion...');
    
    try {
      // Query active design selection and fileId from Companion relay
      const code = `
        const sel = penpot.selection[0];
        if (!sel) return null;
        return {
          id: sel.id,
          name: sel.name,
          type: sel.type,
          fileId: penpot.currentFile ? penpot.currentFile.id : null
        };
      `;
      
      const mcpRes = await callPenpotMcpTool('execute_code', { code });
      
      if (mcpRes.content && mcpRes.content.length > 0) {
        const text = mcpRes.content[0].text;
        if (text && text !== 'null') {
          const info = JSON.parse(text) as { id: string; name: string; type: string; fileId: string | null };
          if (info && info.id) {
            const fileId = info.fileId || 'unknown-file';
            setPenpotNodeInfo({
              fileId,
              objectId: info.id,
              name: info.name || 'Penpot Frame',
            });
            setSyncStatusParent(`Detected Penpot frame: "${info.name || 'Unnamed'}"`);
            return;
          }
        }
      }
      throw new Error('No frame currently selected in Penpot.');
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
    setSyncStatusParent('Requesting from Penpot companion...');

    try {
      const viewport = await miro.board.viewport.get();
      const x = viewport.x + viewport.width / 2;
      const y = viewport.y + viewport.height / 2;

      setSyncStatusParent('Exporting Penpot frame...', 'progress');

      // Fetch shape data from Companion relay
      const mcpResponse = await callPenpotMcpTool('export_shape', {
        shapeId: penpotNodeInfo.objectId,
        format,
        scale,
      });

      if (!mcpResponse.content || mcpResponse.content.length === 0) {
        throw new Error('Penpot relay returned empty export response.');
      }

      // Update the node name from the relay response if available.
      // Reject 'Selected Frame' placeholder — it means the shape was
      // not found on the current Penpot page.
      const responseName = mcpResponse.content[0]?.name;
      if (responseName && typeof responseName === 'string' && responseName !== 'Selected Frame') {
        setPenpotNodeInfo((prev) =>
          prev ? { ...prev, name: responseName } : prev
        );
      }

      let dataUrl: string;
      if (mcpResponse.content[0].type === 'image') {
        // PNG binary — content is { type: 'image', data: base64Data, mimeType: 'image/png' }
        dataUrl = `data:${mcpResponse.content[0].mimeType};base64,${mcpResponse.content[0].data}`;
      } else {
        // SVG text — content is { type: 'text', text: svgText }
        const svgText = mcpResponse.content[0].text;
        if (!svgText) {
          throw new Error('Penpot relay returned empty SVG payload.');
        }
        const base64 = btoa(unescape(encodeURIComponent(svgText)));
        dataUrl = `data:image/svg+xml;base64,${base64}`;
      }

      // Extract natural dimensions from the export response
      const naturalWidth = mcpResponse.content[0]?.width;
      const naturalHeight = mcpResponse.content[0]?.height;

      const resolvedName = (responseName && responseName !== 'Selected Frame')
        ? responseName
        : penpotNodeInfo.name;
      // Snapshot Penpot node info in local variables to prevent stale-closure
      // bugs in the async background fetch below. Without this, the .then()
      // callback may read an updated state from a subsequent import.
      const capturedFileId = penpotNodeInfo.fileId;
      const capturedObjectId = penpotNodeInfo.objectId;
      const capturedName = penpotNodeInfo.name;
      const titleTag = `${resolvedName} [PenpotSync|${capturedFileId}|${capturedObjectId}]`;
      
      // Display width = naturalWidth * scale — the widget visually scales with
      // export resolution (1x=native, 2x=double size, 4x=quadruple).
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

      // Save connection configuration to widget metadata
      await image.setMetadata('syncboard', {
        fileKey: capturedFileId,
        nodeId: capturedObjectId,
        nodeName: capturedName,
        format,
        scale,
        platform: 'penpot',
        width: naturalWidth,
        height: naturalHeight,
      });
      await image.sync();

      // Non-blocking background registration of binary File resource on Miro backend
      // so that right-clicking and downloading the image from Miro uses the frame's actual name.
      if (miroToken) {
        miro.board.getInfo().then((boardInfo) => {
          fetch('/api/miro/update-image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${miroToken}`,
            },
            body: JSON.stringify({
              boardId: boardInfo.id,
              itemId: image.id,
              dataUrl,
              nodeName: capturedName || 'Penpot Screen',
              fileKey: capturedFileId,
              nodeId: capturedObjectId,
              format,
              scale,
              platform: 'penpot',
            }),
          }).catch((err) => console.warn('Background filename registration warning:', err));
        }).catch(() => {});
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
