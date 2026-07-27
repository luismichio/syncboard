'use client';

export default function CookieSettingsButton({ className }: { className?: string }) {
  const handleClick = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('show-cookie-consent'));
    }
  };

  return (
    <button
      onClick={handleClick}
      type="button"
      className={
        className ||
        "px-2.5 py-1 rounded-lg bg-bg-card border border-border-card text-text-muted hover:text-text-page hover:border-text-muted/40 transition duration-200 inline-flex items-center gap-1.5 text-xs font-mono select-none cursor-pointer"
      }
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
        <path d="M8.5 8.5v.01" />
        <path d="M16 15.5v.01" />
        <path d="M12 12v.01" />
        <path d="M11 17v.01" />
        <path d="M7 14v.01" />
      </svg>
      <span>Cookie Settings</span>
    </button>
  );
}
