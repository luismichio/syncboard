'use client';

import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';

export default function ThemeToggle() {
  // Use lazy state initialization to load the theme safely on mount without triggering cascading renders
  const [theme, setTheme] = useState<Theme>('system');

  const applyTheme = (targetTheme: Theme) => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    root.classList.remove('light', 'dark');

    if (targetTheme === 'dark') {
      root.classList.add('dark');
    } else if (targetTheme === 'light') {
      root.classList.add('light');
    } else {
      // System mode: remove classes so media queries in globals.css take over automatically
      const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.add(systemIsDark ? 'dark' : 'light');
    }
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme) {
      // Defer state update to next microtask/tick to prevent synchronous cascading renders
      requestAnimationFrame(() => {
        setTheme(savedTheme);
        applyTheme(savedTheme);
      });
    } else {
      applyTheme('system');
    }
  }, []);

  const cycleTheme = () => {
    let nextTheme: Theme = 'system';
    if (theme === 'system') nextTheme = 'light';
    else if (theme === 'light') nextTheme = 'dark';
    else if (theme === 'dark') nextTheme = 'system';

    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <button
      onClick={cycleTheme}
      className="p-2 rounded-lg bg-bg-card border border-border-card text-text-muted hover:text-text-page hover:border-text-muted/40 transition duration-200 flex items-center gap-2 text-xs font-mono select-none"
      title="Toggle Theme (System -> Light -> Dark)"
    >
      {theme === 'system' && (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
          <span>System</span>
        </>
      )}
      {theme === 'light' && (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
          <span>Light</span>
        </>
      )}
      {theme === 'dark' && (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
          <span>Dark</span>
        </>
      )}
    </button>
  );
}
