interface AppHeaderProps {
  tokensLoading: boolean;
  figmaToken: string | null;
  miroToken: string | null;
}

export function AppHeader({ tokensLoading, figmaToken, miroToken }: AppHeaderProps) {
  return (
    <header className="mb-4 flex items-center justify-between">
      <div className="flex items-start gap-2.5">
        <div
          className="w-6 h-6 mt-0.5 bg-accent shrink-0"
          style={{
            maskImage: 'url(/syncingboard_logo.svg)',
            WebkitMaskImage: 'url(/syncingboard_logo.svg)',
            maskSize: 'contain',
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
          }}
        />
        <div>
          <h2 className="text-xl font-bold tracking-tight text-accent leading-none">SyncingBoard</h2>
          <p className="text-[10px] text-text-muted mt-0.5">Stateless Design-Miro Pipeline</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div
          className={`w-3.5 h-5 transition duration-200 ${tokensLoading ? 'bg-yellow-500/50' : figmaToken ? 'bg-accent' : 'bg-text-muted/30'}`}
          style={{
            maskImage: 'url(/Figma.svg)',
            WebkitMaskImage: 'url(/Figma.svg)',
            maskSize: 'contain',
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
          }}
        />

        <div
          className={`w-[18px] h-[18px] transition duration-200 ${tokensLoading ? 'bg-yellow-500/50' : miroToken ? 'bg-accent' : 'bg-text-muted/30'}`}
          style={{
            maskImage: 'url(/Miro.svg)',
            WebkitMaskImage: 'url(/Miro.svg)',
            maskSize: 'contain',
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
          }}
        />
      </div>
    </header>
  );
}
