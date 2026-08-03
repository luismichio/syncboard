'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMiroPlugin } from './useMiroPlugin';
import { SyncedImage } from './useMiroSelection';
import { DISPLAY, PLAN } from '@/lib/version';
import { getOrCreatePairingId, rotatePairingId } from '@/lib/pairingId';
import { heartbeatRelaySession, releaseLocalRelaySession, setRelayIdentity, sha256Hex } from './companionRelayClient';
import { AppHeader } from './components/AppHeader';
import { TabNav } from './components/TabNav';
import { BoardStatusFooter } from './components/BoardStatusFooter';
import { SyncTab } from './components/SyncTab';
import { ImportTab } from './components/ImportTab';
import { SettingsTab } from './components/SettingsTab';
import { GroupedSyncedImage, ImportPlatform, MiroPluginTab } from './types';

const MAX_SCALE = PLAN === 'community' ? 2 : 4;
const AVAILABLE_SCALES = Array.from({ length: MAX_SCALE }, (_, i) => i + 1);

function buildGroupedItems(selectedItems: SyncedImage[]): GroupedSyncedImage[] {
  const groups: Record<string, GroupedSyncedImage> = {};

  for (const item of selectedItems) {
    const key = `${item.fileKey}|${item.nodeId}`;
    if (!groups[key]) {
      const platform = item.platform || 'figma';
      groups[key] = {
        key,
        fileKey: item.fileKey,
        nodeId: item.nodeId,
        nodeName: item.nodeName,
        format: item.format || (platform === 'penpot' ? 'svg' : 'png'),
        scale: item.scale || 2,
        widgets: [],
        platform,
      };
    }

    groups[key].widgets.push({ id: item.id });
  }

  return Object.values(groups);
}

export default function MiroPluginPage() {
  const [propagate, setPropagate] = useState<boolean>(false);
  const [preserveSize, setPreserveSize] = useState<boolean>(false);

  const {
    isInitMode,
    figmaToken,
    miroToken,
    tokensLoading,
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
    penpotInput,
    penpotNodeInfo,
    isDetectingPenpotLocal,
    parsePenpotLink,
    detectLocalPenpotSelection,
    importPenpotScreen,
    syncSelectedScreens,
  syncAllCopies,
  setSyncAllCopies,
  cooldownSeconds,
  isAnyImageSelected,
    replaceSelectedWidget,
  } = useMiroPlugin(propagate, preserveSize);

  const [activeTab, setActiveTab] = useState<MiroPluginTab>('sync');
  const [importPlatform, setImportPlatform] = useState<ImportPlatform>('figma');
  const [importFormat, setImportFormat] = useState<'png' | 'svg'>('png');
  const [importScale, setImportScale] = useState<number>(1);
  const [defaultPngScale, setDefaultPngScale] = useState<number>(1);
  const [useTauri, setUseTauri] = useState<boolean>(false);
  const [pairingId, setPairingId] = useState<string>('');
  const [copiedPairing, setCopiedPairing] = useState<boolean>(false);
  const [relayUserIdHash, setRelayUserIdHash] = useState<string | null>(null);
  const [relayBoardId, setRelayBoardId] = useState<string | null>(null);
  const [figmaConnected, setFigmaConnected] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const rafId = window.requestAnimationFrame(() => {
      const savedScaleRaw = localStorage.getItem('default_png_scale');
      const parsedScale = savedScaleRaw ? Number(savedScaleRaw) : 1;
      const safeScale = Number.isFinite(parsedScale) && parsedScale >= 1 && parsedScale <= MAX_SCALE
        ? parsedScale
        : 1;

      setDefaultPngScale(safeScale);
      setImportScale(safeScale);
      setUseTauri(localStorage.getItem('syncingboard_use_tauri') === 'true');
      setPairingId(getOrCreatePairingId());
    });

    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    if (!useTauri) return;

    const check = async () => {
      try {
        const res = await fetch('https://local-syncingboard.luiskobayashi.com:4401/health', {
          method: 'GET',
          signal: AbortSignal.timeout(3000),
          targetAddressSpace: 'loopback',
        } as unknown as RequestInit);
        if (res.status !== 200) throw new Error('unreachable');
        const payload = (await res.json()) as { figmaConnected?: boolean } | null;
        setFigmaConnected(payload?.figmaConnected === true);
      } catch {
        setUseTauri(false);
        setFigmaConnected(false);
        localStorage.setItem('syncingboard_use_tauri', 'false');
      }
    };

    void check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [useTauri]);

  // Relay identity (1 board per Miro user, v0.15.1): SHA-256 of
  // miro.currentUser.id — guests with OAuth are first-class users.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const resolve = async () => {
      try {
        const miro = window.miro;
        if (!miro?.currentUser || !miro?.board) return;
        const [user, boardInfo] = await Promise.all([
          miro.currentUser,
          miro.board.getInfo(),
        ]);
        if (cancelled || !user?.id || !boardInfo?.id) return;
        const hash = await sha256Hex(user.id);
        if (cancelled) return;
        setRelayUserIdHash(hash);
        setRelayBoardId(boardInfo.id);
        setRelayIdentity(hash, boardInfo.id);
      } catch {
        // Identity unavailable → relay falls back to legacy pool-only mode.
      }
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  // Desktop (Tauri) local transport: while both connections are live the
  // cloud lease is released back to the 40-slot pool; on local disconnect
  // it is re-acquired so syncs keep working over the cloud.
  useEffect(() => {
    if (!useTauri || typeof window === 'undefined') return;
    if (figmaConnected) {
      releaseLocalRelaySession();
    } else {
      heartbeatRelaySession();
    }
  }, [useTauri, figmaConnected]);

  const fallbackCopyText = (text: string): void => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        setCopiedPairing(true);
        setTimeout(() => setCopiedPairing(false), 2000);
      }
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
  };

  const copyPairingId = (): void => {
    const text = pairingId;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          setCopiedPairing(true);
          setTimeout(() => setCopiedPairing(false), 2000);
        })
        .catch((err) => {
          console.warn('Clipboard API failed, trying fallback copy:', err);
          fallbackCopyText(text);
        });
      return;
    }

    fallbackCopyText(text);
  };

  const handleDefaultPngScaleChange = (value: number): void => {
    setDefaultPngScale(value);
    localStorage.setItem('default_png_scale', String(value));
  };

  const groupedItems = useMemo(() => buildGroupedItems(selectedItems), [selectedItems]);

  const handleGroupSettingChange = async (
    itemIds: string[],
    key: 'format' | 'scale',
    value: unknown
  ): Promise<void> => {
    if (typeof window === 'undefined') return;
    const miro = window.miro;
    if (!miro) return;

    try {
      const selection = await miro.board.getSelection();

      for (const itemId of itemIds) {
        const widget = selection.find((w) => w.id === itemId);
        if (!widget || widget.type !== 'image') continue;

        const metadata = (await widget.getMetadata()) as Record<string, unknown> | undefined;
        const syncData = metadata?.syncingboard as Record<string, unknown> | undefined;

        if (!syncData) continue;

        const updated = {
          ...syncData,
          [key]: value,
        };

        await widget.setMetadata('syncingboard', updated);
        await widget.sync();
      }

      setSelectedItems((prev) =>
        prev.map((item) => {
          if (!itemIds.includes(item.id)) return item;
          if (key === 'format') return { ...item, format: value as 'png' | 'svg' };
          if (key === 'scale') return { ...item, scale: value as number };
          return item;
        })
      );
    } catch (err) {
      console.error('Failed to update widgets settings:', err);
    }
  };

  const handleRefreshNodeName = async (
    fileKey: string,
    nodeId: string,
    platform: 'figma' | 'penpot'
  ): Promise<void> => {
    if (platform !== 'figma' || !figmaToken) return;
    try {
      const res = await fetch(
        `/api/figma/node-info?fileKey=${encodeURIComponent(fileKey)}&nodeId=${encodeURIComponent(nodeId)}`,
        { headers: { Authorization: `Bearer ${figmaToken}` } }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!data.name) return;

      const newName: string = data.name;

      if (typeof window !== 'undefined' && window.miro) {
        const miro = window.miro;
        const selection = await miro.board.getSelection();
        for (const item of selection) {
          if (item.type === 'image' && item.title) {
            const tag = 'FigmaSync';
            if (item.title.includes(`[${tag}|${fileKey}|${nodeId}]`)) {
              item.title = `${newName} [${tag}|${fileKey}|${nodeId}]`;
              await item.sync();
            }
          }
        }
      }

      setSelectedItems((prev) =>
        prev.map((item) =>
          item.fileKey === fileKey && item.nodeId === nodeId
            ? {
                ...item,
                nodeName: newName,
                title: `${newName} [FigmaSync|${fileKey}|${nodeId}]`,
              }
            : item
        )
      );
    } catch (err) {
      console.error('Failed to refresh node name:', err);
    }
  };

  if (isInitMode === null) {
    return null;
  }

  if (isInitMode === true) {
    return <div className="bg-bg-page h-screen"></div>;
  }

  return (
    <div className="flex flex-col min-h-screen p-5 bg-bg-page text-text-page font-sans selection:bg-accent selection:text-bg-page transition-colors duration-200">
      <AppHeader
        tokensLoading={tokensLoading}
        figmaToken={figmaToken}
        miroToken={miroToken}
      />

      <TabNav
        activeTab={activeTab}
        selectedItemsCount={selectedItems.length}
        onTabChange={setActiveTab}
      />

      <section className="flex-grow flex flex-col">
        {activeTab === 'sync' && (
          <SyncTab
            selectedItemsCount={selectedItems.length}
            groupedItems={groupedItems}
            syncAllCopies={syncAllCopies}
            setSyncAllCopies={setSyncAllCopies}
            preserveSize={preserveSize}
            setPreserveSize={setPreserveSize}
            propagate={propagate}
            setPropagate={setPropagate}
          isSyncing={isSyncing}
          cooldownSeconds={cooldownSeconds}
          hasMiroToken={!!miroToken}
            onSync={syncSelectedScreens}
            onGroupSettingChange={handleGroupSettingChange}
            onRefreshNodeName={handleRefreshNodeName}
            availableScales={AVAILABLE_SCALES}
          />
        )}

        {activeTab === 'import' && (
          <ImportTab
          hasMiroToken={!!miroToken}
          relayUserIdHash={relayUserIdHash}
          relayBoardId={relayBoardId}
          useTauri={useTauri}
          figmaConnected={figmaConnected}
            importPlatform={importPlatform}
            setImportPlatform={setImportPlatform}
            importFormat={importFormat}
            setImportFormat={setImportFormat}
            importScale={importScale}
            setImportScale={setImportScale}
            availableScales={AVAILABLE_SCALES}
            isSyncing={isSyncing}
            isAnyImageSelected={isAnyImageSelected}
            preserveSize={preserveSize}
            setPreserveSize={setPreserveSize}
            figmaToken={figmaToken}
            figmaInput={figmaInput}
            figmaNodeInfo={figmaNodeInfo}
            isDetectingLocal={isDetectingLocal}
            parseFigmaLink={parseFigmaLink}
            detectLocalFigmaSelection={detectLocalFigmaSelection}
            importFigmaScreen={importFigmaScreen}
            penpotInput={penpotInput}
            penpotNodeInfo={penpotNodeInfo}
            isDetectingPenpotLocal={isDetectingPenpotLocal}
            parsePenpotLink={parsePenpotLink}
            detectLocalPenpotSelection={detectLocalPenpotSelection}
            importPenpotScreen={importPenpotScreen}
            replaceSelectedWidget={replaceSelectedWidget}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            tokensLoading={tokensLoading}
            figmaToken={figmaToken}
            miroToken={miroToken}
            connectFigma={connectFigma}
            connectMiro={connectMiro}
            disconnectFigma={disconnectFigma}
            disconnectMiro={disconnectMiro}
            copiedPairing={copiedPairing}
            pairingId={pairingId}
            copyPairingId={copyPairingId}
            onRegeneratePairingId={() => {
              const newId = rotatePairingId();
              setPairingId(newId);
              setCopiedPairing(false);
            }}
            useTauri={useTauri}
            defaultPngScale={defaultPngScale}
            onDefaultPngScaleChange={handleDefaultPngScaleChange}
            availableScales={AVAILABLE_SCALES}
          />
        )}
      </section>

      <footer className="mt-4 pt-3 border-t border-border-card">
        <p className="text-center text-[9px] font-mono text-text-muted/50">{DISPLAY}</p>
      </footer>

      <BoardStatusFooter status={syncStatus} />
    </div>
  );
}
