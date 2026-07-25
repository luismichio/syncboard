export type MiroPluginTab = 'sync' | 'import' | 'settings';
export type ImportPlatform = 'figma' | 'penpot';

export interface GroupedSyncedImage {
  key: string;
  fileKey: string;
  nodeId: string;
  nodeName: string;
  format: 'png' | 'svg';
  scale: number;
  widgets: { id: string }[];
  platform: 'figma' | 'penpot';
}
