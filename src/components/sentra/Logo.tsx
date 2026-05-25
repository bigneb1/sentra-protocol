export function Logo({ size = 28, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <path d="M3 9 L16 3 L29 9 L23.5 13 L16 9.5 L8.5 13 Z" fill="#7C3AED" />
        <path d="M8.5 17 L16 20.5 L23.5 17 L29 21 L16 27 L3 21 Z" fill="#A78BFA" />
        <circle cx="16" cy="16" r="1.6" fill="#F0EBF8" />
      </svg>
      {withText && (
        <span
          className="font-mono font-bold tracking-[0.18em] text-foreground"
          style={{ fontSize: size * 0.55 }}
        >
          SENTRA
        </span>
      )}
    </div>
  );
}
