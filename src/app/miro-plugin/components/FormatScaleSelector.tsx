interface FormatScaleSelectorProps {
  format: 'png' | 'svg';
  scale: number;
  availableScales: number[];
  onFormatChange: (format: 'png' | 'svg') => void;
  onScaleChange: (scale: number) => void;
}

export function FormatScaleSelector({
  format,
  scale,
  availableScales,
  onFormatChange,
  onScaleChange,
}: FormatScaleSelectorProps) {
  return (
    <div className="flex gap-2 mt-2 pt-2 border-t border-border-card/30">
      <div className="flex-1 flex flex-col gap-0.5">
        <span className="text-[8px] font-mono text-text-muted uppercase tracking-wider">Format</span>
        <select
          value={format}
          onChange={(e) => onFormatChange(e.target.value as 'png' | 'svg')}
          className="bg-bg-page border border-border-card text-[10px] rounded px-1.5 py-0.5 focus:outline-none focus:border-accent text-text-page w-full cursor-pointer"
        >
          <option value="png">PNG</option>
          <option value="svg">SVG</option>
        </select>
      </div>

      {format === 'png' && (
        <div className="flex-1 flex flex-col gap-0.5">
          <span className="text-[8px] font-mono text-text-muted uppercase tracking-wider">Scale</span>
          <select
            value={scale}
            onChange={(e) => onScaleChange(Number(e.target.value))}
            className="bg-bg-page border border-border-card text-[10px] rounded px-1.5 py-0.5 focus:outline-none focus:border-accent text-text-page w-full cursor-pointer"
          >
            {availableScales.map((s) => (
              <option key={s} value={s}>{s}x</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
