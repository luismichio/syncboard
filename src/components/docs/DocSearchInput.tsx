'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

export interface SearchResultItem {
  slug: string;
  title: string;
  description: string;
  filename: string;
  category: 'Overview' | 'Architecture' | 'Reference' | 'Archives';
  score: number;
  matchedSection?: {
    text: string;
    id: string;
  };
  snippet: string;
}

export interface DocSearchInputProps {
  value: string;
  onChange: (query: string) => void;
  onSelectResult?: () => void;
}

/** Helper component to highlight matching query terms */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-accent/30 text-accent font-semibold px-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export function DocSearchInput({ value, onChange, onSelectResult }: DocSearchInputProps) {
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch search results from server endpoint when query is active
  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/docs/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((data) => {
          setResults(data.results || []);
          setIsOpen(true);
          setSelectedIndex(-1);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 150);

    return () => clearTimeout(timer);
  }, [value]);

  // Global Cmd+K / Ctrl+K shortcut listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || results.length === 0) {
        if (e.key === 'Escape') {
          inputRef.current?.blur();
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < results.length) {
        e.preventDefault();
        const item = results[selectedIndex];
        const targetUrl = item.matchedSection
          ? `/docs/${item.slug}#${item.matchedSection.id}`
          : `/docs/${item.slug}`;
        window.location.href = targetUrl;
        setIsOpen(false);
        if (onSelectResult) onSelectResult();
      }
    },
    [isOpen, results, selectedIndex, onSelectResult]
  );

  const handleClear = () => {
    onChange('');
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full">
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
          ref={inputRef}
          type="text"
          aria-label="Search full documentation"
          value={value}
          onChange={(e) => {
            const newValue = e.target.value;
            onChange(newValue);
            if (!newValue.trim()) {
              setResults([]);
              setIsOpen(false);
            } else {
              setIsOpen(true);
            }
          }}
          onFocus={() => {
            if (value.trim() && results.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="Search full documentation (e.g. Figma, Ably, Rate Limits)..."
          className="w-full pl-10 pr-20 py-2.5 bg-bg-card border border-border-card rounded-xl text-xs font-mono text-text-page placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition duration-200"
        />

        <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-1.5">
          {value ? (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search query"
              className="text-xs font-mono text-text-muted hover:text-text-page px-1.5 py-0.5 rounded transition"
            >
              CLEAR
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono text-text-muted px-1.5 py-0.5 bg-bg-page border border-border-card rounded pointer-events-none">
              ⌘K / Ctrl+K
            </kbd>
          )}
        </div>
      </div>

      {/* Interactive Full-Text Search Dropdown with Category Hierarchy */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full mt-2 z-50 bg-bg-card border border-border-card rounded-xl shadow-2xl overflow-hidden max-h-96 overflow-y-auto"
        >
          {loading && (
            <div className="p-4 text-center text-xs font-mono text-text-muted">
              Searching full-text index...
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="p-4 text-center text-xs font-mono text-text-muted">
              No matching terms found in titles, sections, or body text.
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="py-2 divide-y divide-border-card/50">
              <div className="px-3 py-1.5 text-[10px] font-mono text-text-muted uppercase tracking-wider flex justify-between items-center">
                <span>Ranked Search Results ({results.length})</span>
                <span className="text-text-muted/60">Use ↑↓ keys to navigate</span>
              </div>
              {results.map((item, idx) => {
                const targetUrl = item.matchedSection
                  ? `/docs/${item.slug}#${item.matchedSection.id}`
                  : `/docs/${item.slug}`;
                const isSelected = idx === selectedIndex;
                const isArchive = item.category === 'Archives';

                return (
                  <Link
                    key={`${item.slug}-${idx}`}
                    href={targetUrl}
                    onClick={() => {
                      setIsOpen(false);
                      if (onSelectResult) onSelectResult();
                    }}
                    className={`block px-4 py-3 transition ${
                      isSelected
                        ? 'bg-accent/10 border-l-2 border-accent'
                        : isArchive
                        ? 'bg-bg-page/30 opacity-75 hover:opacity-100 hover:bg-bg-page/60'
                        : 'hover:bg-bg-page/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-text-page font-mono truncate">
                          <HighlightedText text={item.title} query={value} />
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                            item.category === 'Overview'
                              ? 'bg-accent/15 text-accent'
                              : item.category === 'Architecture'
                              ? 'bg-blue-500/15 text-blue-400'
                              : item.category === 'Reference'
                              ? 'bg-purple-500/15 text-purple-400'
                              : 'bg-text-muted/15 text-text-muted'
                          }`}
                        >
                          {item.category.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {item.matchedSection && (
                      <div className="mt-1 text-xs font-semibold text-accent flex items-center gap-1.5">
                        <span className="text-text-muted">#</span>
                        <span>
                          <HighlightedText text={item.matchedSection.text} query={value} />
                        </span>
                      </div>
                    )}

                    <p className="mt-1 text-xs text-text-muted line-clamp-2 font-sans">
                      <HighlightedText text={item.snippet} query={value} />
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
