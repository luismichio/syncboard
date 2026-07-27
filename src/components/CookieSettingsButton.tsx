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
      className={className || "underline hover:text-text-page transition-colors cursor-pointer"}
    >
      Cookie Settings
    </button>
  );
}
