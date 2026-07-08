interface MiroViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MiroItem {
  id: string;
  type: string;
  title?: string;
  width?: number;
  setMetadata(key: string, value: any): Promise<void>;
  getMetadata(): Promise<any>;
}

interface MiroBoardInfo {
  id: string;
}

interface MiroBoard {
  get(): Promise<MiroItem[]>;
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
  storage: {
    set(key: string, value: string): Promise<void>;
    get(key: string): Promise<string | undefined>;
  };
}

interface Window {
  miro?: {
    board: MiroBoard;
  };
}
