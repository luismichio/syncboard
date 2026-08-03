import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities';
import { FigmaNodeInfo } from '../useFigmaImporter';
import { PenpotNodeInfo } from '../usePenpotImporter';
import { ImportPlatform } from '../types';
import { FormatScaleSelector } from './FormatScaleSelector';
import { RelayStatusBanner } from './RelayStatusBanner';

interface ImportTabProps {
  importPlatform: ImportPlatform;
  setImportPlatform: (platform: ImportPlatform) => void;
  importFormat: 'png' | 'svg';
  setImportFormat: (format: 'png' | 'svg') => void;
  importScale: number;
  setImportScale: (scale: number) => void;
  availableScales: number[];
  isSyncing: boolean;
  isAnyImageSelected: boolean;
hasMiroToken: boolean;
relayUserIdHash?: string | null;
relayBoardId?: string | null;
useTauri?: boolean;
figmaConnected?: boolean;
  preserveSize: boolean;
  setPreserveSize: (value: boolean) => void;

  // Figma
  figmaToken: string | null;
  figmaInput: string;
  figmaNodeInfo: FigmaNodeInfo | null;
  isDetectingLocal: boolean;
  parseFigmaLink: (url: string) => Promise<void>;
  detectLocalFigmaSelection: () => Promise<void>;
  importFigmaScreen: (format: 'png' | 'svg', scale?: number) => Promise<void>;

  // Penpot
  penpotInput: string;
  penpotNodeInfo: PenpotNodeInfo | null;
  isDetectingPenpotLocal: boolean;
  parsePenpotLink: (url: string) => void;
  detectLocalPenpotSelection: () => Promise<void>;
  importPenpotScreen: (format: 'png' | 'svg', scale?: number) => Promise<void>;

  // Shared replace flow
  replaceSelectedWidget: (
    platform: 'figma' | 'penpot',
    fileKey: string,
    nodeId: string,
    nodeName: string,
    format: 'png' | 'svg',
    scale: number
  ) => Promise<void>;
}

export function ImportTab({
  importPlatform,
  setImportPlatform,
  importFormat,
  setImportFormat,
  importScale,
  setImportScale,
  availableScales,
  isSyncing,
  isAnyImageSelected,
hasMiroToken,
relayUserIdHash,
relayBoardId,
useTauri,
figmaConnected,
  preserveSize,
  setPreserveSize,
  figmaToken,
  figmaInput,
  figmaNodeInfo,
  isDetectingLocal,
  parseFigmaLink,
  detectLocalFigmaSelection,
  importFigmaScreen,
  penpotInput,
  penpotNodeInfo,
  isDetectingPenpotLocal,
  parsePenpotLink,
  detectLocalPenpotSelection,
  importPenpotScreen,
  replaceSelectedWidget,
}: ImportTabProps) {
  return (
    <div className="flex-grow flex flex-col gap-4">
      <RelayStatusBanner
        userIdHash={relayUserIdHash}
        boardId={relayBoardId}
        useTauri={useTauri}
        figmaConnected={figmaConnected}
      />
      {hasMiroToken ? (
        <>
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
                />
              </div>

              {figmaNodeInfo && (
                <div className="p-3 bg-bg-card rounded border border-border-card mt-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-text-page truncate">
                        {decodeHtmlEntities(figmaNodeInfo.name)}
                      </div>
                      <div className="text-[9px] font-mono text-text-muted truncate">
                        File: {figmaNodeInfo.fileKey}
                      </div>
                    </div>
                    <button
                      onClick={() => parseFigmaLink(figmaInput)}
                      className="shrink-0 flex items-center justify-center w-6 h-6 rounded hover:bg-bg-page transition cursor-pointer text-text-muted hover:text-text-page"
                      title="Refresh node info from Figma"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10" />
                        <polyline points="1 20 1 14 7 14" />
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                      </svg>
                    </button>
                  </div>

                  <FormatScaleSelector
                    format={importFormat}
                    scale={importScale}
                    availableScales={availableScales}
                    onFormatChange={setImportFormat}
                    onScaleChange={setImportScale}
                  />

                  <button
                    onClick={() => importFigmaScreen(importFormat, importScale)}
                    disabled={isSyncing}
                    className="w-full mt-3 font-mono font-bold text-xs py-2 rounded bg-accent text-bg-page hover:opacity-90 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isSyncing ? 'PLACING...' : 'PLACE ON CANVAS'}
                  </button>

                  {isAnyImageSelected && (
                    <label className="flex flex-col gap-0.5 mt-2 cursor-pointer select-none">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={preserveSize}
                          onChange={(e) => setPreserveSize(e.target.checked)}
                          className="accent-accent w-3 h-3"
                        />
                        <span className="text-[10px] text-text-muted font-mono">
                          Keep canvas size
                        </span>
                      </div>
                      <p className="ml-5 text-[8px] font-mono text-text-muted/50 leading-tight">
                        Size locked. Crop resets — Miro API limitation.
                      </p>
                    </label>
                  )}

                  <button
                    onClick={() => {
                      if (figmaNodeInfo) {
                        void replaceSelectedWidget(
                          'figma',
                          figmaNodeInfo.fileKey,
                          figmaNodeInfo.nodeId,
                          figmaNodeInfo.name,
                          importFormat,
                          importScale
                        );
                      }
                    }}
                    disabled={isSyncing || !figmaNodeInfo || !isAnyImageSelected}
                    className="w-full mt-2 font-mono font-bold text-xs py-2 rounded border border-accent text-accent bg-transparent hover:bg-accent hover:text-bg-page transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    REPLACE SELECTED
                  </button>

                  <p className="text-[9px] font-mono text-text-muted/60 text-center mt-1.5">
                    API syncs cannot be undone with Ctrl+Z
                  </p>
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
            />
          </div>

          {penpotNodeInfo && (
            <div className="p-3 bg-bg-card rounded border border-border-card mt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-text-page truncate">
                    {decodeHtmlEntities(penpotNodeInfo.name)}
                  </div>
                  <div className="text-[9px] font-mono text-text-muted truncate">
                    File ID: {penpotNodeInfo.fileId}
                  </div>
                </div>
                <button
                  onClick={() => parsePenpotLink(penpotInput)}
                  className="shrink-0 flex items-center justify-center w-6 h-6 rounded hover:bg-bg-page transition cursor-pointer text-text-muted hover:text-text-page"
                  title="Refresh node info from Penpot"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                </button>
              </div>

              <FormatScaleSelector
                format={importFormat}
                scale={importScale}
                availableScales={availableScales}
                onFormatChange={setImportFormat}
                onScaleChange={setImportScale}
              />

              <button
                onClick={() => importPenpotScreen(importFormat, importScale)}
                disabled={isSyncing}
                className="w-full mt-3 font-mono font-bold text-xs py-2 rounded bg-accent text-bg-page hover:opacity-90 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSyncing ? 'PLACING...' : 'PLACE ON CANVAS'}
              </button>

              {isAnyImageSelected && (
                <label className="flex flex-col gap-0.5 mt-2 cursor-pointer select-none">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={preserveSize}
                      onChange={(e) => setPreserveSize(e.target.checked)}
                      className="accent-accent w-3 h-3"
                    />
                    <span className="text-[10px] text-text-muted font-mono">
                      Keep canvas size
                    </span>
                  </div>
                  <p className="ml-5 text-[8px] font-mono text-text-muted/50 leading-tight">
                    Size locked. Crop resets — Miro API limitation.
                  </p>
                </label>
              )}

              <button
                onClick={() => {
                  if (penpotNodeInfo) {
                    void replaceSelectedWidget(
                      'penpot',
                      penpotNodeInfo.fileId,
                      penpotNodeInfo.objectId,
                      penpotNodeInfo.name,
                      importFormat,
                      importScale
                    );
                  }
                }}
                disabled={isSyncing || !penpotNodeInfo || !isAnyImageSelected}
                className="w-full mt-2 font-mono font-bold text-xs py-2 rounded border border-accent text-accent bg-transparent hover:bg-accent hover:text-bg-page transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                REPLACE SELECTED
              </button>

              <p className="text-[9px] font-mono text-text-muted/60 text-center mt-1.5">
                API syncs cannot be undone with Ctrl+Z
              </p>
            </div>
          )}
        </div>
      )}
        </>
      ) : (
        <div className="p-8 rounded-md border border-dashed border-border-card text-center text-xs text-text-muted py-12 my-auto">
          Connect your Miro account in Settings to import, detect, or replace frames.
        </div>
      )}
    </div>
  );
}
