import { MiroPluginTab } from '../types';

interface TabNavProps {
  activeTab: MiroPluginTab;
  selectedItemsCount: number;
  onTabChange: (tab: MiroPluginTab) => void;
}

export function TabNav({ activeTab, selectedItemsCount, onTabChange }: TabNavProps) {
  return (
    <div className="flex border-b border-border-card mb-5">
      <button
        onClick={() => onTabChange('sync')}
        className={`flex-1 pb-2 text-xs font-mono tracking-wider font-semibold border-b-2 text-center transition ${
          activeTab === 'sync'
            ? 'border-accent text-accent'
            : 'border-transparent text-text-muted hover:text-text-page'
        }`}
      >
        SYNC ({selectedItemsCount})
      </button>
      <button
        onClick={() => onTabChange('import')}
        className={`flex-1 pb-2 text-xs font-mono tracking-wider font-semibold border-b-2 text-center transition ${
          activeTab === 'import'
            ? 'border-accent text-accent'
            : 'border-transparent text-text-muted hover:text-text-page'
        }`}
      >
        IMPORT
      </button>
      <button
        onClick={() => onTabChange('settings')}
        className={`flex-1 pb-2 text-xs font-mono tracking-wider font-semibold border-b-2 text-center transition ${
          activeTab === 'settings'
            ? 'border-accent text-accent'
            : 'border-transparent text-text-muted hover:text-text-page'
        }`}
      >
        SETTINGS
      </button>
    </div>
  );
}
