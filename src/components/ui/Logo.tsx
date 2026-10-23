export function Logo({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <g fill="var(--accent)">
        <circle cx="32" cy="14" r="12" /><circle cx="50" cy="28" r="12" /><circle cx="43" cy="49" r="12" />
        <circle cx="21" cy="49" r="12" /><circle cx="14" cy="28" r="12" />
      </g>
      <circle cx="32" cy="34" r="9" fill="#fff" />
    </svg>
  );
}
