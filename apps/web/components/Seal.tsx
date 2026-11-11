/** Mandate's mark: a wax-seal style badge with a check, the "signed permission" in one glyph. */
export function Seal({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true">
      <path
        d="M20 1.5l3.6 3.1 4.7-.9 1.8 4.4 4.4 1.8-.9 4.7 3.1 3.6-3.1 3.6.9 4.7-4.4 1.8-1.8 4.4-4.7-.9L20 38.5l-3.6-3.1-4.7.9-1.8-4.4-4.4-1.8.9-4.7L1.5 20l3.1-3.6-.9-4.7 4.4-1.8 1.8-4.4 4.7.9z"
        fill="#60CDFF"
      />
      <circle cx="20" cy="20" r="12.5" fill="#0070E0" />
      <path d="M14.2 20.4l3.9 3.9 7.7-8.2" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
