'use client';

export interface DocSearchInputProps {
  value: string;
  onChange: (query: string) => void;
}

export function DocSearchInput({ value, onChange }: DocSearchInputProps) {
  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>
      <input
        type="text"
        aria-label="Search documentation"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search documentation (e.g. Figma, Ably, Rate Limits)..."
        className="w-full pl-10 pr-16 py-2.5 bg-bg-card border border-border-card rounded-xl text-xs font-mono text-text-page placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition duration-200"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Clear search query"
          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs font-mono text-text-muted hover:text-text-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
        >
          CLEAR
        </button>
      )}
    </div>
  );
}
