export function Waveform({ playing = false, blurred = false, bars = 48, height = 36 }: { playing?: boolean; blurred?: boolean; bars?: number; height?: number }) {
  return (
    <svg
      viewBox={`0 0 ${bars * 4} ${height}`}
      className="w-full"
      style={{ height, filter: blurred ? "blur(4px)" : "none", opacity: blurred ? 0.55 : 1 }}
    >
      {Array.from({ length: bars }).map((_, i) => {
        const h = 6 + ((Math.sin(i * 0.7) + 1) / 2) * (height - 8) * (0.4 + ((i * 13) % 6) / 10);
        return (
          <rect
            key={i}
            x={i * 4 + 1}
            y={(height - h) / 2}
            width={2}
            height={h}
            rx={1}
            fill="#7C3AED"
            className={playing ? "wave-bar" : ""}
            style={playing ? { animationDelay: `${(i % 12) * 0.07}s` } : undefined}
          />
        );
      })}
    </svg>
  );
}
